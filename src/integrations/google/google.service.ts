import { GoogleAccountService } from '@/modules/google-account/google-account.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { formatBrazil, parseBrazilDateTime } from '@/common/helpers/brazil-date';
import { google } from 'googleapis';

type CalendarEvent = {
  summary: string;
  start: Date;
  end: Date;
  recurrence?: string[];
};

@Injectable()
export class GoogleService {
  constructor(private googleAccountService: GoogleAccountService) {}

  private readonly BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000;

  private isOverlapping(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
    return aStart < bEnd && aEnd > bStart;
  }

  private roundUpToNextHourBrazil(date: Date) {
    const brInstant = new Date(date.getTime() - this.BRAZIL_OFFSET_MS);
    const rounded = new Date(brInstant);

    rounded.setUTCMinutes(0, 0, 0);
    if (rounded < brInstant) rounded.setUTCHours(rounded.getUTCHours() + 1);

    return new Date(rounded.getTime() + this.BRAZIL_OFFSET_MS);
  }

  private getEndOfMonth(date: Date) {
    const br = new Date(date.getTime() - this.BRAZIL_OFFSET_MS);
    const endWallClockUtc = Date.UTC(br.getUTCFullYear(), br.getUTCMonth() + 1, 0, 23, 59, 59, 999);
    return new Date(endWallClockUtc + this.BRAZIL_OFFSET_MS);
  }

  private assertValidBrazilRange(rangeStart: string, rangeEnd: string) {
    let start: Date;
    let end: Date;

    try {
      start = parseBrazilDateTime(rangeStart);
      end = parseBrazilDateTime(rangeEnd);
    } catch {
      throw new BadRequestException(
        `rangeStart/rangeEnd inválidos. Esperado formato tipo "2026-02-03T15:00:00-03:00". Recebido rangeStart="${rangeStart}" rangeEnd="${rangeEnd}"`,
      );
    }

    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException(
        `rangeEnd deve ser maior que rangeStart. Recebido rangeStart="${rangeStart}" rangeEnd="${rangeEnd}"`,
      );
    }

    return { start, end };
  }

  private normalizeGoogleEventTimesToDate(event: any) {
    // O Google normalmente retorna RFC3339 (com timezone).
    // Aqui assumimos que vem no formato BR (-03:00), mas o parse aceita TZ explícito.
    const rawStart: string | null = event?.start?.dateTime ?? event?.start?.date ?? null;
    const rawEnd: string | null = event?.end?.dateTime ?? event?.end?.date ?? null;

    const isDateOnly = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

    const startValue = rawStart && isDateOnly(rawStart) ? `${rawStart}T00:00:00-03:00` : rawStart;
    const endValue = rawEnd && isDateOnly(rawEnd) ? `${rawEnd}T00:00:00-03:00` : rawEnd;

    if (!startValue || !endValue) return null;

    try {
      return {
        start: parseBrazilDateTime(startValue),
        end: parseBrazilDateTime(endValue),
      };
    } catch {
      return null;
    }
  }

  private createOAuthClient() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  getAuthUrl(workerId: number) {
    const oauth2Client = this.createOAuthClient();

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      state: workerId.toString(),
    });
  }

  async getTokens(code: string) {
    const oauth2Client = this.createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  }

  getCalendarClient(refreshToken: string) {
    const oauth2Client = this.createOAuthClient();

    oauth2Client.setCredentials({ refresh_token: refreshToken });

    return google.calendar({
      version: 'v3',
      auth: oauth2Client,
    });
  }

  async getUserEmail(tokens: any): Promise<string> {
    const oauth2Client = this.createOAuthClient();

    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      version: 'v2',
      auth: oauth2Client,
    });

    const { data } = await oauth2.userinfo.get();

    return data.email!;
  }

  async getCalendarEvents(workerId: number, rangeStart: string, rangeEnd: string) {
    const googleAccount = await this.googleAccountService.findUnique(workerId);

    const calendar = this.getCalendarClient(googleAccount.googleRefreshToken);

    this.assertValidBrazilRange(rangeStart, rangeEnd);

    const [offline, appointments] = await Promise.all([
      calendar.events.list({
        calendarId: googleAccount.googleCalendarId,
        timeMin: rangeStart,
        timeMax: rangeEnd,
        q: 'Offline',
      }),
      calendar.events.list({
        calendarId: googleAccount.googleCalendarId,
        timeMin: rangeStart,
        timeMax: rangeEnd,
        privateExtendedProperty: ['type=appointment'],
      }),
    ]);

    const eventsMap = new Map();

    [...(offline.data.items ?? []), ...(appointments.data.items ?? [])].forEach((event) => {
      eventsMap.set(event.id, event);
    });

    const events = Array.from(eventsMap.values());

    return events.reduce<CalendarEvent[]>((acc, event) => {
      const normalized = this.normalizeGoogleEventTimesToDate(event);
      if (!normalized) return acc;

      acc.push({
        summary: event.summary,
        start: normalized.start,
        end: normalized.end,
        recurrence: event.recurrence,
      });

      return acc;
    }, []);
  }

  expandRecurringEvents(events: CalendarEvent[], rangeStart: Date, rangeEnd: Date) {
    const expanded: CalendarEvent[] = [];

    for (const event of events) {
      if (!event.recurrence) {
        expanded.push(event);
        continue;
      }

      const rule: string = event.recurrence[0];

      if (rule.includes('FREQ=DAILY')) {
        const currentStart = new Date(event.start);
        const currentEnd = new Date(event.end);

        let safety = 0;
        while (currentStart <= rangeEnd && safety < 366) {
          if (currentEnd >= rangeStart) {
            expanded.push({
              ...event,
              start: new Date(currentStart),
              end: new Date(currentEnd),
              recurrence: undefined,
            });
          }

          currentStart.setTime(currentStart.getTime() + 24 * 60 * 60 * 1000);
          currentEnd.setTime(currentEnd.getTime() + 24 * 60 * 60 * 1000);
          safety += 1;
        }
      }
    }

    return expanded;
  }

  generateAvailableSlots(
    events: CalendarEvent[],
    rangeStart: Date,
    rangeEnd: Date,
    slotDurationMs: number = 60 * 60 * 1000,
  ) {
    const available: Array<{ start: Date; end: Date }> = [];

    const busyEvents = this.expandRecurringEvents(events, rangeStart, rangeEnd);

    let cursor = this.roundUpToNextHourBrazil(rangeStart);

    while (cursor.getTime() + slotDurationMs <= rangeEnd.getTime()) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor.getTime() + slotDurationMs);

      const hasConflict = busyEvents.some((event) =>
        this.isOverlapping(slotStart, slotEnd, event.start, event.end),
      );

      if (!hasConflict) {
        available.push({ start: slotStart, end: slotEnd });
      }

      cursor = new Date(cursor.getTime() + slotDurationMs);
    }

    return available;
  }

  async getAvailableSlots(workerId: number) {
    const now = new Date();
    const brNow = new Date(now.getTime() - this.BRAZIL_OFFSET_MS);
    brNow.setUTCDate(brNow.getUTCDate() + 1);
    brNow.setUTCHours(0, 0, 0, 0);

    const startInstant = new Date(brNow.getTime() + this.BRAZIL_OFFSET_MS);
    const endInstant = this.getEndOfMonth(startInstant);

    const start = formatBrazil(startInstant);
    const end = formatBrazil(endInstant);

    const { start: rangeStart, end: rangeEnd } = this.assertValidBrazilRange(start, end);

    const events = await this.getCalendarEvents(workerId, start, end);

    const slots = this.generateAvailableSlots(events, rangeStart, rangeEnd);

    return slots.map((s) => ({
      start: formatBrazil(s.start),
      end: formatBrazil(s.end),
    }));
  }
}
