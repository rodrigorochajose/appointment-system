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
import { UserService } from '../user/user.service';
import { formatBrazil, parseBrazilDateTime } from '@/common/helpers/brazil-date';
import { log } from '@/common/logger';

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
    if (rangeEnd.getTime() <= rangeStart.getTime()) return [];
    if (limit !== undefined && limit <= 0) return [];

    const dayStartOfRange = this.startOfDayBR(rangeStart);
    const numDays = Math.ceil((rangeEnd.getTime() - dayStartOfRange.getTime()) / ONE_DAY_MS);
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
            lt(unavailablePeriods.begin, rangeEnd),
          ),
        ),
      this.db
        .select({ datetime: appointments.datetime })
        .from(appointments)
        .where(
          and(
            eq(appointments.workerId, workerId),
            gte(appointments.datetime, rangeStart),
            lt(appointments.datetime, rangeEnd),
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
