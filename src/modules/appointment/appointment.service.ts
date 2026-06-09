import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE_CONNECTION } from 'src/database/database.module';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { and, eq, gte, lt } from 'drizzle-orm';
import {
  appointments,
  schedules,
  unavailablePeriods,
  workingHours,
  UnavailablePeriod,
  WorkingHour,
} from 'src/database/schemas';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentResponseDto } from './dto/appointment-response.dto';
import { ApiResponse } from 'src/common/interface/api-response.interface';
import { handleDatabaseError } from 'src/common/helpers/database-error-handler';
import { GoogleService } from '@/integrations/google/google.service';
import { GoogleAccountService } from '../google-account/google-account.service';
import { GoogleAccountResponseDto } from '../google-account/dto/google-account-response.dto';
import { UserService } from '../user/user.service';
import { formatBrazil, parseBrazilDateTime } from '@/common/helpers/brazil-date';
import { log } from '@/common/logger';
import type { calendar_v3 } from 'googleapis';

/** Resultado da sincronização de um calendário. */
export type CalendarSyncResult = {
  workerId: number;
  cancelled: number;
  moved: number;
  bootstrapped?: boolean;
  resynced?: boolean;
  error?: boolean;
};

export type DailyAvailability = {
  date: string;
  weekday: number;
  weekdayLabel: string;
  slots: string[];
};

export type SlotListItem = {
  id: string;
  title: string;
};

export function toSlotListItems(days: DailyAvailability[]): SlotListItem[] {
  const items: SlotListItem[] = [];
  for (const day of days) {
    const [, mm, dd] = day.date.split('-');
    const weekdayAbbr = day.weekdayLabel.slice(0, 3);
    for (const time of day.slots) {
      items.push({
        id: `${day.date}T${time}:00-03:00`,
        title: `${weekdayAbbr} ${dd}/${mm} - ${time}`,
      });
    }
  }
  return items;
}

const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

const SLOT_DURATION_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Janela de agendamento do cliente: ele só pode agendar de hoje até este número
 * de dias corridos à frente. É uma janela ROLANTE — recalculada a partir de
 * "agora" a cada chamada, então avança um dia a cada dia que passa.
 */
const BOOKING_WINDOW_DAYS = 60;

@Injectable()
export class AppointmentService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: MySql2Database,
    private googleService: GoogleService,
    private googleAccountService: GoogleAccountService,
    private userService: UserService,
  ) {}

  async create(data: CreateAppointmentDto): Promise<null> {
    try {
      await this.db.transaction(async (tx) => {
        const [result] = await tx.insert(appointments).values({
          offeringId: data.offeringId ?? 1,
          userId: data.userId,
          workerId: data.workerId,
          fixed: data.fixed ?? false,
          datetime: new Date(data.datetime),
        });

        const eventId = await this.createGoogleEvent(data.workerId, data.userId, data.datetime);

        if (eventId) {
          await tx
            .update(appointments)
            .set({ googleEventId: eventId })
            .where(eq(appointments.id, result.insertId));
        }
      });

      return null;
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async createGoogleEvent(workerId: number, userId: number, start: string): Promise<string | null> {
    const userName = await this.userService.getNameById(userId);

    if (!userName) {
      throw new NotFoundException('User not found');
    }

    const googleAccount = await this.googleAccountService.findUnique(workerId);

    if (!googleAccount) {
      throw new NotFoundException('Google Account not found');
    }

    const calendar = this.googleService.getCalendarClient(googleAccount.googleRefreshToken);

    if (!calendar) {
      throw new NotFoundException('Calendar not found');
    }

    const startDate = parseBrazilDateTime(start);
    const endDate = formatBrazil(new Date(startDate.getTime() + 60 * 60 * 1000));

    const { data } = await calendar.events.insert({
      calendarId: googleAccount.googleCalendarId,
      requestBody: {
        summary: `Corte - ${userName}`,
        start: {
          dateTime: start,
          timeZone: 'America/Sao_Paulo',
        },
        end: {
          dateTime: endDate,
          timeZone: 'America/Sao_Paulo',
        },
        reminders: {
          useDefault: false,
          overrides: [],
        },
        extendedProperties: {
          private: {
            type: 'appointment',
          },
        },
      },
    });

    return data.id ?? null;
  }

  /**
   * Remarca um agendamento: atualiza o datetime no banco e move o evento
   * correspondente no Google Calendar (quando houver googleEventId salvo).
   */
  async reschedule(appointmentId: number, newIso: string): Promise<void> {
    try {
      const appointment = await this.findUnique(appointmentId);

      await this.db
        .update(appointments)
        .set({ datetime: new Date(newIso) })
        .where(eq(appointments.id, appointmentId));

      if (appointment.googleEventId && appointment.workerId) {
        await this.updateGoogleEvent(appointment.workerId, appointment.googleEventId, newIso);
      }
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async updateGoogleEvent(workerId: number, eventId: string, start: string): Promise<void> {
    const googleAccount = await this.googleAccountService.findUnique(workerId);

    if (!googleAccount) {
      throw new NotFoundException('Google Account not found');
    }

    const calendar = this.googleService.getCalendarClient(googleAccount.googleRefreshToken);

    if (!calendar) {
      throw new NotFoundException('Calendar not found');
    }

    const startDate = parseBrazilDateTime(start);
    const endDate = formatBrazil(new Date(startDate.getTime() + 60 * 60 * 1000));

    await calendar.events.patch({
      calendarId: googleAccount.googleCalendarId,
      eventId,
      requestBody: {
        start: {
          dateTime: start,
          timeZone: 'America/Sao_Paulo',
        },
        end: {
          dateTime: endDate,
          timeZone: 'America/Sao_Paulo',
        },
      },
    });
  }

  /** Cancela um agendamento: remove o evento no Google Calendar e a linha no banco. */
  async cancel(appointmentId: number): Promise<void> {
    try {
      const appointment = await this.findUnique(appointmentId);

      if (appointment.googleEventId && appointment.workerId) {
        await this.deleteGoogleEvent(appointment.workerId, appointment.googleEventId);
      }

      await this.db.delete(appointments).where(eq(appointments.id, appointmentId));
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  /** Cancela todos os agendamentos de um cliente (banco + eventos no Google Calendar). */
  async cancelAllByUserId(userId: number): Promise<void> {
    try {
      const list = await this.findManyByUserId(userId);

      for (const appointment of list) {
        if (appointment.googleEventId && appointment.workerId) {
          await this.deleteGoogleEvent(appointment.workerId, appointment.googleEventId);
        }
      }

      await this.db.delete(appointments).where(eq(appointments.userId, userId));
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  /**
   * Remove um evento do Google Calendar. Tolerante a falhas (ex.: evento já
   * removido manualmente) para não impedir a exclusão no banco.
   */
  async deleteGoogleEvent(workerId: number, eventId: string): Promise<void> {
    try {
      const googleAccount = await this.googleAccountService.findUnique(workerId);
      if (!googleAccount) return;

      const calendar = this.googleService.getCalendarClient(googleAccount.googleRefreshToken);
      if (!calendar) return;

      await calendar.events.delete({
        calendarId: googleAccount.googleCalendarId,
        eventId,
      });
    } catch (error) {
      log.warn('deleteGoogleEvent: falha ao remover evento no Google Calendar', {
        workerId,
        eventId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  // ============================================================
  // SINCRONIZAÇÃO REVERSA: Google Calendar -> banco
  // Cobre cancelamento (exclusão de evento) e movimentação (mudança de horário).
  // Idempotente: alterações feitas pelo próprio sistema não causam efeito
  // (cancelado sem agendamento correspondente / horário já igual = no-op).
  // ============================================================

  /**
   * Sincroniza todas as contas Google conectadas. Acionado pelo cron externo
   * (endpoint protegido) e reutilizável por um push notification futuro.
   */
  async syncAllCalendars(): Promise<CalendarSyncResult[]> {
    const accounts = await this.googleAccountService.findAll();
    const results: CalendarSyncResult[] = [];

    for (const account of accounts) {
      try {
        results.push(await this.syncCalendarForAccount(account));
      } catch (err) {
        log.error(
          'syncCalendar: falha ao sincronizar conta',
          err instanceof Error ? err : { workerId: account.workerId, err },
        );
        results.push({ workerId: account.workerId, cancelled: 0, moved: 0, error: true });
      }
    }

    return results;
  }

  private async syncCalendarForAccount(
    account: GoogleAccountResponseDto,
  ): Promise<CalendarSyncResult> {
    const calendar = this.googleService.getCalendarClient(account.googleRefreshToken);
    if (!calendar) {
      return { workerId: account.workerId, cancelled: 0, moved: 0, error: true };
    }

    // 1º run (ou token perdido): estabelece o syncToken sem reconciliar.
    if (!account.syncToken) {
      const token = await this.bootstrapSyncToken(calendar, account.googleCalendarId);
      await this.googleAccountService.updateSyncToken(account.workerId, token);
      return { workerId: account.workerId, cancelled: 0, moved: 0, bootstrapped: true };
    }

    let cancelled = 0;
    let moved = 0;
    let pageToken: string | undefined;
    let nextSyncToken: string | null | undefined;

    try {
      do {
        const { data } = await calendar.events.list({
          calendarId: account.googleCalendarId,
          syncToken: account.syncToken,
          pageToken,
          maxResults: 250,
        });

        for (const event of data.items ?? []) {
          const r = await this.reconcileEvent(event);
          cancelled += r.cancelled;
          moved += r.moved;
        }

        pageToken = data.nextPageToken ?? undefined;
        nextSyncToken = data.nextSyncToken;
      } while (pageToken);
    } catch (err) {
      // 410 Gone: syncToken expirou/invalidou -> resync completo (novo token).
      const status = (err as { code?: number; response?: { status?: number } })?.code ??
        (err as { response?: { status?: number } })?.response?.status;
      if (status === 410) {
        log.warn('syncCalendar: syncToken inválido (410), refazendo sync completo', {
          workerId: account.workerId,
        });
        const token = await this.bootstrapSyncToken(calendar, account.googleCalendarId);
        await this.googleAccountService.updateSyncToken(account.workerId, token);
        return { workerId: account.workerId, cancelled, moved, resynced: true };
      }
      throw err;
    }

    if (nextSyncToken) {
      await this.googleAccountService.updateSyncToken(account.workerId, nextSyncToken);
    }

    return { workerId: account.workerId, cancelled, moved };
  }

  /**
   * Faz uma varredura completa (paginada) só para obter o nextSyncToken inicial.
   * timeMin = agora: só nos interessa o que está por vir (libera/move slots futuros).
   */
  private async bootstrapSyncToken(
    calendar: calendar_v3.Calendar,
    calendarId: string,
  ): Promise<string | null> {
    let pageToken: string | undefined;
    let syncToken: string | null = null;
    const timeMin = new Date().toISOString();

    do {
      const { data } = await calendar.events.list({
        calendarId,
        singleEvents: true,
        // true para que o sync incremental reporte eventos cancelados de forma confiável.
        showDeleted: true,
        timeMin,
        pageToken,
        maxResults: 250,
      });
      pageToken = data.nextPageToken ?? undefined;
      syncToken = data.nextSyncToken ?? syncToken;
    } while (pageToken);

    return syncToken;
  }

  /** Reconcilia um evento alterado com o agendamento correspondente no banco. */
  private async reconcileEvent(
    event: calendar_v3.Schema$Event,
  ): Promise<{ cancelled: number; moved: number }> {
    const eventId = event.id;
    if (!eventId) return { cancelled: 0, moved: 0 };

    const appointment = await this.findByGoogleEventId(eventId);
    // Evento sem agendamento correspondente: criado direto no Google (fora de
    // escopo) ou já removido pelo próprio sistema. No-op (evita loop de eco).
    if (!appointment) return { cancelled: 0, moved: 0 };

    if (event.status === 'cancelled') {
      await this.db.delete(appointments).where(eq(appointments.id, appointment.id));
      log.info('syncCalendar: agendamento cancelado via Google Calendar', {
        appointmentId: appointment.id,
        eventId,
      });
      return { cancelled: 1, moved: 0 };
    }

    const newStart = event.start?.dateTime;
    if (newStart) {
      const newDate = new Date(newStart);
      if (
        !Number.isNaN(newDate.getTime()) &&
        formatBrazil(newDate) !== formatBrazil(appointment.datetime)
      ) {
        try {
          await this.db
            .update(appointments)
            .set({ datetime: newDate })
            .where(eq(appointments.id, appointment.id));
          log.info('syncCalendar: agendamento movido via Google Calendar', {
            appointmentId: appointment.id,
            eventId,
            from: formatBrazil(appointment.datetime),
            to: formatBrazil(newDate),
          });
          return { cancelled: 0, moved: 1 };
        } catch (err) {
          // Provável conflito com unique(worker, datetime) — ignora este evento.
          log.warn('syncCalendar: não foi possível mover (horário já ocupado?)', {
            appointmentId: appointment.id,
            eventId,
            error: err instanceof Error ? err.message : err,
          });
          return { cancelled: 0, moved: 0 };
        }
      }
    }

    return { cancelled: 0, moved: 0 };
  }

  private async findByGoogleEventId(eventId: string): Promise<AppointmentResponseDto | undefined> {
    const [appointment] = await this.db
      .select()
      .from(appointments)
      .where(eq(appointments.googleEventId, eventId));
    return appointment;
  }

  async findManyByUserId(userId: number): Promise<AppointmentResponseDto[]> {
    return await this.db.select().from(appointments).where(eq(appointments.userId, userId));
  }

  async findUnique(id: number): Promise<AppointmentResponseDto> {
    const [appointment] = await this.db.select().from(appointments).where(eq(appointments.id, id));

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  async update(id: number, data: UpdateAppointmentDto): Promise<AppointmentResponseDto> {
    try {
      const updateData: any = { ...data };
      if (data.datetime) {
        updateData.datetime = new Date(data.datetime);
      }

      await this.db.update(appointments).set(updateData).where(eq(appointments.id, id));
      return this.findUnique(id);
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async delete(id: number): Promise<ApiResponse> {
    try {
      await this.findUnique(id);
      await this.db.delete(appointments).where(eq(appointments.id, id));
      return { message: 'Appointment deleted successfully' };
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async getAvailableSlots(
    workerId: number,
    rangeStart: Date,
    rangeEnd: Date,
    limit?: number,
  ): Promise<DailyAvailability[]> {
    // Aplica a janela de agendamento rolante: o fim efetivo nunca ultrapassa
    // "hoje + BOOKING_WINDOW_DAYS". Como todos os fluxos do cliente passam por
    // aqui, este é o único ponto de enforcement do limite superior.
    const { endExclusive } = this.getBookingWindow();
    const effectiveEnd =
      rangeEnd.getTime() > endExclusive.getTime() ? endExclusive : rangeEnd;

    if (effectiveEnd.getTime() <= rangeStart.getTime()) return [];
    if (limit !== undefined && limit <= 0) return [];

    const dayStartOfRange = this.startOfDayBR(rangeStart);
    const numDays = Math.ceil((effectiveEnd.getTime() - dayStartOfRange.getTime()) / ONE_DAY_MS);
    if (numDays <= 0) return [];

    const [schedule] = await this.db
      .select({ id: schedules.id })
      .from(schedules)
      .where(eq(schedules.workerId, workerId))
      .limit(1);

    if (!schedule) {
      return this.buildEmptyDays(dayStartOfRange, numDays);
    }

    const [whRows, unavailable, booked] = await Promise.all([
      this.db.select().from(workingHours).where(eq(workingHours.scheduleId, schedule.id)),
      this.db
        .select()
        .from(unavailablePeriods)
        .where(
          and(
            eq(unavailablePeriods.scheduleId, schedule.id),
            gte(unavailablePeriods.end, rangeStart),
            lt(unavailablePeriods.begin, effectiveEnd),
          ),
        ),
      this.db
        .select({ datetime: appointments.datetime })
        .from(appointments)
        .where(
          and(
            eq(appointments.workerId, workerId),
            gte(appointments.datetime, rangeStart),
            lt(appointments.datetime, effectiveEnd),
          ),
        ),
    ]);

    const whByWeekday = new Map<number, WorkingHour[]>();
    for (const wh of whRows) {
      const list = whByWeekday.get(wh.weekday) ?? [];
      list.push(wh);
      whByWeekday.set(wh.weekday, list);
    }

    const bookedSet = new Set(booked.map((b) => b.datetime.getTime()));
    const now = Date.now();
    const result: DailyAvailability[] = [];
    let totalSlots = 0;

    outer: for (let offset = 0; offset < numDays; offset++) {
      if (limit !== undefined && totalSlots >= limit) break;

      const dayStart = new Date(dayStartOfRange.getTime() + offset * ONE_DAY_MS);
      const weekday = dayStart.getDay();
      const windows = whByWeekday.get(weekday) ?? [];
      const daySlots: string[] = [];

      for (const window of windows) {
        let cursor = this.combineDateAndTime(dayStart, window.begin);
        const windowEnd = this.combineDateAndTime(dayStart, window.end);

        while (cursor.getTime() + SLOT_DURATION_MS <= windowEnd.getTime()) {
          if (limit !== undefined && totalSlots >= limit) break outer;

          const slotEnd = new Date(cursor.getTime() + SLOT_DURATION_MS);

          if (
            cursor.getTime() >= rangeStart.getTime() &&
            cursor.getTime() > now &&
            !this.overlapAny(cursor, slotEnd, unavailable) &&
            // NOTE: igualdade exata é suficiente enquanto duração e granularidade forem 60min.
            // Ao introduzir duração variável, trocar por overlap real contra [datetime, datetime + duration].
            !bookedSet.has(cursor.getTime())
          ) {
            daySlots.push(this.formatHour(cursor));
            totalSlots++;
          }

          cursor = new Date(cursor.getTime() + SLOT_DURATION_MS);
        }
      }

      result.push({
        date: formatBrazil(dayStart).slice(0, 10),
        weekday,
        weekdayLabel: WEEKDAY_LABELS[weekday],
        slots: daySlots,
      });
    }

    return result;
  }

  async getAvailableSlotsForDay(
    workerId: number,
    date: Date,
    limit?: number,
  ): Promise<DailyAvailability[]> {
    const rangeStart = this.startOfDayBR(date);
    const rangeEnd = new Date(rangeStart.getTime() + ONE_DAY_MS);
    return this.getAvailableSlots(workerId, rangeStart, rangeEnd, limit);
  }

  async getNextAvailableSlots(
    workerId: number,
    limit: number,
    from?: Date,
    maxLookaheadDays: number = 30,
  ): Promise<DailyAvailability[]> {
    const rangeStart = from ?? new Date();
    const rangeEnd = new Date(
      this.startOfDayBR(rangeStart).getTime() + maxLookaheadDays * ONE_DAY_MS,
    );
    return this.getAvailableSlots(workerId, rangeStart, rangeEnd, limit);
  }

  /**
   * Janela de agendamento permitida ao cliente: de hoje (00:00) até
   * BOOKING_WINDOW_DAYS dias corridos à frente.
   *
   * - `start`: início do dia de hoje (00:00, -03:00).
   * - `lastDay`: último dia agendável (00:00) — hoje + BOOKING_WINDOW_DAYS.
   * - `endExclusive`: primeiro instante FORA da janela (lastDay + 1 dia).
   *
   * Rolante: como deriva de "agora", avança um dia a cada dia que passa.
   */
  getBookingWindow(now: Date = new Date()): { start: Date; lastDay: Date; endExclusive: Date } {
    const start = this.startOfDayBR(now);
    const lastDay = new Date(start.getTime() + BOOKING_WINDOW_DAYS * ONE_DAY_MS);
    const endExclusive = new Date(lastDay.getTime() + ONE_DAY_MS);
    return { start, lastDay, endExclusive };
  }

  private startOfDayBR(date: Date): Date {
    const ymd = formatBrazil(date).slice(0, 10);
    return parseBrazilDateTime(`${ymd}T00:00:00`);
  }

  private combineDateAndTime(date: Date, time: string): Date {
    const ymd = formatBrazil(date).slice(0, 10);
    return parseBrazilDateTime(`${ymd}T${time}-03:00`);
  }

  private overlapAny(slotStart: Date, slotEnd: Date, list: UnavailablePeriod[]): boolean {
    return list.some((u) => slotStart < u.end && slotEnd > u.begin);
  }

  private formatHour(date: Date): string {
    return formatBrazil(date).slice(11, 16);
  }

  private buildEmptyDays(dayStartOfRange: Date, numDays: number): DailyAvailability[] {
    const result: DailyAvailability[] = [];
    for (let offset = 0; offset < numDays; offset++) {
      const dayStart = new Date(dayStartOfRange.getTime() + offset * ONE_DAY_MS);
      const weekday = dayStart.getDay();
      result.push({
        date: formatBrazil(dayStart).slice(0, 10),
        weekday,
        weekdayLabel: WEEKDAY_LABELS[weekday],
        slots: [],
      });
    }
    return result;
  }
}
