import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE_CONNECTION } from 'src/database/database.module';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import {
  appointments,
  fixedSeries,
  fixedSeriesExceptions,
  schedules,
  unavailablePeriods,
  workingHours,
  FixedSeries,
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
import { randomUUID } from 'node:crypto';

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

/** Uma ocorrência futura de um cliente (linha real OU projeção de série fixa). */
export type UserOccurrence = {
  /** Id da linha na lista do WhatsApp: real = `"<id>"`; virtual = `"v<seriesId>_<epochMs>"`. */
  rowId: string;
  datetime: Date;
  /** Id do agendamento real, ou null se ainda virtual (projetada, não materializada). */
  appointmentId: number | null;
  /** Série fixa de origem, quando aplicável. */
  seriesId: number | null;
};

/** Interpreta um `rowId` de {@link UserOccurrence} vindo da lista do WhatsApp. */
export function parseOccurrenceRowId(rowId: string): {
  appointmentId: number | null;
  seriesId: number | null;
  datetime: Date | null;
} {
  const m = /^v(\d+)_(\d+)$/.exec(rowId);
  if (m) {
    return { appointmentId: null, seriesId: Number(m[1]), datetime: new Date(Number(m[2])) };
  }
  const id = Number(rowId);
  return {
    appointmentId: Number.isNaN(id) || id <= 0 ? null : id,
    seriesId: null,
    datetime: null,
  };
}

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

/** TTL solicitado ao criar o canal de push (Google pode reduzir). */
const WATCH_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Renova o canal quando faltar menos que isto para expirar. */
const WATCH_RENEW_MARGIN_MS = 24 * 60 * 60 * 1000;

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

  /**
   * Cancela todos os agendamentos de um cliente (banco + eventos no Google) e
   * desativa suas séries fixas (removendo o evento recorrente), para que a
   * projeção também pare de ocupar horários futuros.
   */
  async cancelAllByUserId(userId: number): Promise<void> {
    try {
      const list = await this.findManyByUserId(userId);

      for (const appointment of list) {
        if (appointment.googleEventId && appointment.workerId) {
          await this.deleteGoogleEvent(appointment.workerId, appointment.googleEventId);
        }
      }

      const activeSeries = await this.db
        .select()
        .from(fixedSeries)
        .where(and(eq(fixedSeries.userId, userId), eq(fixedSeries.active, true)));
      for (const s of activeSeries) {
        if (s.googleEventId && s.workerId) {
          await this.deleteGoogleEvent(s.workerId, s.googleEventId);
        }
      }

      await this.db.transaction(async (tx) => {
        await tx.delete(appointments).where(eq(appointments.userId, userId));
        await tx
          .update(fixedSeries)
          .set({ active: false, googleEventId: null })
          .where(and(eq(fixedSeries.userId, userId), eq(fixedSeries.active, true)));
      });
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
    // Evento sem agendamento correspondente: pode ser o evento recorrente de uma
    // série fixa (ou uma de suas instâncias) — tenta reconciliar por lá. Se nem
    // isso casar, é evento fora de escopo / eco do próprio sistema → no-op.
    if (!appointment) return this.reconcileFixedSeriesEvent(event);

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

  /**
   * Reconcilia um evento do Google que se refere a uma SÉRIE FIXA (o próprio
   * evento recorrente ou uma de suas instâncias). Cobre:
   * - master cancelado → desativa a série;
   * - instância cancelada → grava exceção (pula aquela semana);
   * - instância movida → materializa a ocorrência no novo horário (só no banco;
   *   não mexe no Google para não ecoar).
   */
  private async reconcileFixedSeriesEvent(
    event: calendar_v3.Schema$Event,
  ): Promise<{ cancelled: number; moved: number }> {
    // 1) É o evento recorrente (master) de uma série?
    if (event.id) {
      const [master] = await this.db
        .select()
        .from(fixedSeries)
        .where(eq(fixedSeries.googleEventId, event.id));
      if (master) {
        if (event.status === 'cancelled') {
          await this.db
            .update(fixedSeries)
            .set({ active: false, googleEventId: null })
            .where(eq(fixedSeries.id, master.id));
          log.info('syncCalendar: série fixa desativada via Google Calendar', {
            seriesId: master.id,
            eventId: event.id,
          });
          return { cancelled: 1, moved: 0 };
        }
        // Mudança de RRULE/horário do master: fora de escopo por ora.
        return { cancelled: 0, moved: 0 };
      }
    }

    // 2) É uma INSTÂNCIA de uma série (cancelada ou movida)?
    const recurringId = event.recurringEventId;
    if (!recurringId) return { cancelled: 0, moved: 0 };

    const [series] = await this.db
      .select()
      .from(fixedSeries)
      .where(eq(fixedSeries.googleEventId, recurringId));
    if (!series) return { cancelled: 0, moved: 0 };

    const origStr = event.originalStartTime?.dateTime;
    if (!origStr) return { cancelled: 0, moved: 0 };
    const origDate = new Date(origStr);
    if (Number.isNaN(origDate.getTime())) return { cancelled: 0, moved: 0 };
    const origDay = this.startOfDayBR(origDate);

    if (event.status === 'cancelled') {
      await this.db
        .insert(fixedSeriesExceptions)
        .values({ seriesId: series.id, date: origDay })
        .onDuplicateKeyUpdate({ set: { date: origDay } });
      log.info('syncCalendar: ocorrência de série pulada via Google Calendar', {
        seriesId: series.id,
        date: formatBrazil(origDate),
      });
      return { cancelled: 1, moved: 0 };
    }

    const newStr = event.start?.dateTime;
    if (!newStr) return { cancelled: 0, moved: 0 };
    const newDate = new Date(newStr);
    if (Number.isNaN(newDate.getTime()) || newDate.getTime() === origDate.getTime()) {
      return { cancelled: 0, moved: 0 };
    }

    try {
      await this.db
        .insert(fixedSeriesExceptions)
        .values({ seriesId: series.id, date: origDay })
        .onDuplicateKeyUpdate({ set: { date: origDay } });
      await this.db.insert(appointments).values({
        userId: series.userId,
        workerId: series.workerId,
        offeringId: series.offeringId,
        fixed: true,
        fixedSeriesId: series.id,
        datetime: newDate,
        googleEventId: event.id ?? null,
      });
      log.info('syncCalendar: ocorrência de série movida via Google Calendar', {
        seriesId: series.id,
        from: formatBrazil(origDate),
        to: formatBrazil(newDate),
      });
      return { cancelled: 0, moved: 1 };
    } catch (err) {
      log.warn('syncCalendar: não foi possível materializar ocorrência movida (ocupado?)', {
        seriesId: series.id,
        error: err instanceof Error ? err.message : err,
      });
      return { cancelled: 0, moved: 0 };
    }
  }

  private async findByGoogleEventId(eventId: string): Promise<AppointmentResponseDto | undefined> {
    const [appointment] = await this.db
      .select()
      .from(appointments)
      .where(eq(appointments.googleEventId, eventId));
    return appointment;
  }

  // ============================================================
  // PUSH NOTIFICATIONS (events.watch): Google avisa em tempo real.
  // O canal expira em dias -> renovação periódica (cron interno).
  // A notificação só diz "mudou algo" (corpo vazio) -> roda o sync incremental.
  // ============================================================

  /**
   * Garante um canal de push ativo para cada conta, renovando os que estão
   * perto de expirar (ou ausentes). Acionado pelo cron interno.
   */
  async ensureWatchChannels(): Promise<
    { workerId: number; renewed?: boolean; skipped?: boolean; error?: boolean }[]
  > {
    const webhookUrl = process.env.GOOGLE_WEBHOOK_URL;
    if (!webhookUrl) {
      log.error('ensureWatchChannels: GOOGLE_WEBHOOK_URL não configurado');
      return [];
    }

    const accounts = await this.googleAccountService.findAll();
    const results: { workerId: number; renewed?: boolean; skipped?: boolean; error?: boolean }[] =
      [];

    for (const account of accounts) {
      try {
        const exp = account.watchExpiration ? new Date(account.watchExpiration).getTime() : 0;
        const needsRenew =
          !account.watchChannelId || !exp || exp - Date.now() < WATCH_RENEW_MARGIN_MS;

        if (!needsRenew) {
          results.push({ workerId: account.workerId, skipped: true });
          continue;
        }

        await this.renewWatchForAccount(account, webhookUrl);
        results.push({ workerId: account.workerId, renewed: true });
      } catch (err) {
        log.error(
          'ensureWatchChannels: falha ao renovar canal',
          err instanceof Error ? err : { workerId: account.workerId, err },
        );
        results.push({ workerId: account.workerId, error: true });
      }
    }

    return results;
  }

  private async renewWatchForAccount(
    account: GoogleAccountResponseDto,
    webhookUrl: string,
  ): Promise<void> {
    const calendar = this.googleService.getCalendarClient(account.googleRefreshToken);
    if (!calendar) throw new Error('Calendar client indisponível');

    // Garante o syncToken antes de assistir, para não perder a 1ª mudança.
    if (!account.syncToken) {
      const token = await this.bootstrapSyncToken(calendar, account.googleCalendarId);
      await this.googleAccountService.updateSyncToken(account.workerId, token);
    }

    // Para o canal antigo (best-effort) antes de criar o novo.
    if (account.watchChannelId && account.watchResourceId) {
      await this.stopChannel(calendar, account.watchChannelId, account.watchResourceId);
    }

    const channelId = randomUUID();
    const { data } = await calendar.events.watch({
      calendarId: account.googleCalendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        // Echoado de volta em X-Goog-Channel-Token; validado no webhook.
        token: process.env.GOOGLE_SYNC_TOKEN,
        params: { ttl: String(WATCH_TTL_SECONDS) },
      },
    });

    const expiration = data.expiration ? new Date(Number(data.expiration)) : null;
    await this.googleAccountService.updateWatch(account.workerId, {
      channelId,
      resourceId: data.resourceId ?? null,
      expiration,
    });

    log.info('ensureWatchChannels: canal de push renovado', {
      workerId: account.workerId,
      channelId,
      expiration: expiration?.toISOString(),
    });
  }

  private async stopChannel(
    calendar: calendar_v3.Calendar,
    channelId: string,
    resourceId: string,
  ): Promise<void> {
    try {
      await calendar.channels.stop({ requestBody: { id: channelId, resourceId } });
    } catch (err) {
      log.warn('stopChannel: falha ao parar canal antigo (ignorado)', {
        channelId,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  /**
   * Processa uma notificação de push do Google. Valida o token, ignora o ping
   * inicial ("sync") e dispara o sync incremental da conta dona do canal.
   * Nunca lança: o webhook deve responder 200 mesmo em caso de problema.
   */
  async handleNotification(opts: {
    channelId?: string;
    resourceState?: string;
    token?: string;
  }): Promise<void> {
    const expected = process.env.GOOGLE_SYNC_TOKEN;
    if (!expected || opts.token !== expected) {
      log.warn('handleNotification: token do canal inválido');
      return;
    }

    // Primeira mensagem após o watch é só um "sync" de confirmação.
    if (opts.resourceState === 'sync') return;
    if (!opts.channelId) return;

    const account = await this.googleAccountService.findByChannelId(opts.channelId);
    if (!account) {
      log.warn('handleNotification: canal desconhecido', { channelId: opts.channelId });
      return;
    }

    try {
      const result = await this.syncCalendarForAccount(account);
      log.info('handleNotification: sync disparado por push', { result });
    } catch (err) {
      log.error(
        'handleNotification: falha no sync',
        err instanceof Error ? err : { workerId: account.workerId, err },
      );
    }
  }

  async findManyByUserId(userId: number): Promise<AppointmentResponseDto[]> {
    return await this.db.select().from(appointments).where(eq(appointments.userId, userId));
  }

  /**
   * Ocorrências FUTURAS de um cliente para os fluxos do bot (listar/cancelar/
   * remarcar): linhas reais + ocorrências projetadas das séries fixas, ordenadas
   * por horário. Cada item traz um `rowId` para a lista do WhatsApp — real
   * (`"<id>"`) ou virtual (`"v<seriesId>_<epochMs>"`, ainda não materializada).
   */
  async listUserOccurrences(
    userId: number,
    from: Date = new Date(),
  ): Promise<UserOccurrence[]> {
    const horizonEnd = new Date(from.getTime() + BOOKING_WINDOW_DAYS * ONE_DAY_MS);

    const real = await this.db
      .select()
      .from(appointments)
      .where(and(eq(appointments.userId, userId), gte(appointments.datetime, from)));

    const projected = await this.expandSeriesInRange({ userId }, from, horizonEnd);

    const items: UserOccurrence[] = [
      ...real.map((r) => ({
        rowId: String(r.id),
        datetime: r.datetime,
        appointmentId: r.id,
        seriesId: r.fixedSeriesId,
      })),
      ...projected.map((p) => ({
        rowId: `v${p.seriesId}_${p.datetime.getTime()}`,
        datetime: p.datetime,
        appointmentId: null,
        seriesId: p.seriesId,
      })),
    ];

    return items.sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  }

  async findUnique(id: number): Promise<AppointmentResponseDto> {
    const [appointment] = await this.db.select().from(appointments).where(eq(appointments.id, id));

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  /**
   * Agendamentos de um profissional que SOBREPÕEM o intervalo [begin, end).
   * Como cada agendamento dura SLOT_DURATION_MS, um agendamento que começa até
   * uma duração antes de `begin` ainda pode invadir o intervalo. Buscamos a
   * partir de `begin - duração` e filtramos pelo overlap real.
   * Usado para detectar conflitos ao indisponibilizar um horário.
   */
  async findManyByWorkerOverlapping(
    workerId: number,
    begin: Date,
    end: Date,
  ): Promise<AppointmentResponseDto[]> {
    const lower = new Date(begin.getTime() - SLOT_DURATION_MS);
    const rows = await this.db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.workerId, workerId),
          gte(appointments.datetime, lower),
          lt(appointments.datetime, end),
        ),
      );

    // Inclui ocorrências projetadas de séries fixas (para detectar/avisar o conflito).
    const projected = (await this.expandSeriesInRange({ workerId }, lower, end)).map((p) =>
      this.projectionToDto(p),
    );

    return [...rows, ...projected].filter(
      (apt) => apt.datetime.getTime() + SLOT_DURATION_MS > begin.getTime(),
    );
  }

  /** Agendamentos de um profissional num dia (00:00–24:00 do `dayStart`), reais + projetados. */
  async findManyByWorkerOnDay(workerId: number, dayStart: Date): Promise<AppointmentResponseDto[]> {
    const dayEnd = new Date(dayStart.getTime() + ONE_DAY_MS);
    const rows = await this.db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.workerId, workerId),
          gte(appointments.datetime, dayStart),
          lt(appointments.datetime, dayEnd),
        ),
      );

    const projected = (await this.expandSeriesInRange({ workerId }, dayStart, dayEnd)).map((p) =>
      this.projectionToDto(p),
    );

    return [...rows, ...projected].sort(
      (a, b) => a.datetime.getTime() - b.datetime.getTime(),
    );
  }

  /** Converte uma ocorrência projetada num DTO sintético (id=0, sem evento próprio). */
  private projectionToDto(p: {
    seriesId: number;
    userId: number;
    workerId: number;
    offeringId: number;
    datetime: Date;
  }): AppointmentResponseDto {
    return {
      id: 0,
      userId: p.userId,
      workerId: p.workerId,
      offeringId: p.offeringId,
      datetime: p.datetime,
      fixed: true,
      seriesId: null,
      fixedSeriesId: p.seriesId,
      googleEventId: null,
      createdAt: p.datetime,
      updatedAt: p.datetime,
    };
  }

  /**
   * Cancela UMA semana de uma série sem materializar: grava exceção (a projeção
   * para de gerar a ocorrência) e remove a instância do evento recorrente no
   * Google (best-effort). Usado quando a indisponibilização conflita com um fixo.
   */
  async skipSeriesOccurrence(seriesId: number, occurrence: Date): Promise<void> {
    const day = this.startOfDayBR(occurrence);
    await this.db
      .insert(fixedSeriesExceptions)
      .values({ seriesId, date: day })
      .onDuplicateKeyUpdate({ set: { date: day } });

    const [series] = await this.db
      .select()
      .from(fixedSeries)
      .where(eq(fixedSeries.id, seriesId));
    if (series?.googleEventId && series.workerId) {
      await this.cancelRecurringInstance(series.workerId, series.googleEventId, occurrence);
    }
  }

  /**
   * Resumo para o menu do barbeiro: quantos agendamentos ainda vão acontecer
   * hoje e qual é o próximo agendamento futuro (com o cliente).
   */
  async getWorkerDaySummary(
    workerId: number,
  ): Promise<{ remainingToday: number; next: { datetime: Date; userId: number } | null }> {
    const now = new Date();
    const todayStart = parseBrazilDateTime(`${formatBrazil(now).slice(0, 10)}T00:00:00`);

    const todays = await this.findManyByWorkerOnDay(workerId, todayStart);
    const remainingToday = todays.filter((apt) => apt.datetime.getTime() > now.getTime()).length;

    const [nextReal] = await this.db
      .select()
      .from(appointments)
      .where(and(eq(appointments.workerId, workerId), gte(appointments.datetime, now)))
      .orderBy(asc(appointments.datetime))
      .limit(1);

    // Considera também a próxima ocorrência projetada de uma série fixa.
    const horizonEnd = new Date(now.getTime() + BOOKING_WINDOW_DAYS * ONE_DAY_MS);
    const projected = await this.expandSeriesInRange({ workerId }, now, horizonEnd);

    let next: { datetime: Date; userId: number } | null = nextReal
      ? { datetime: nextReal.datetime, userId: nextReal.userId }
      : null;
    for (const p of projected) {
      if (!next || p.datetime.getTime() < next.datetime.getTime()) {
        next = { datetime: p.datetime, userId: p.userId };
      }
    }

    return { remainingToday, next };
  }

  // ============================================================
  // FIXAR CLIENTE (séries recorrentes semanais — projeção virtual)
  //
  // A série é uma REGRA (uma linha em `fixed_series`): dia da semana + horário.
  // As ocorrências NÃO são materializadas em `appointment`; são projetadas em
  // tempo de leitura por `expandSeriesInRange`. Só viram linha real quando
  // desviam da regra (remarcação/cancelamento de uma semana → `materializeOccurrence`).
  // Não há cron para "estender" nem janela rolante: a projeção cobre qualquer
  // intervalo pedido.
  // ============================================================

  /**
   * Cria uma fixação semanal a partir de `firstOccurrence` (dia+hora âncora).
   * Insere UMA regra em `fixed_series`; quando o worker tem conta Google,
   * espelha como um único evento recorrente (RRULE WEEKLY). Sem materializar
   * ocorrências — o bloqueio dos slots vem da projeção.
   */
  async createFixedSeries(
    workerId: number,
    userId: number,
    firstOccurrence: Date,
  ): Promise<{ seriesId: number }> {
    const dayStart = this.startOfDayBR(firstOccurrence);
    const weekday = dayStart.getDay();
    const time = this.formatHour(firstOccurrence);

    const [result] = await this.db.insert(fixedSeries).values({
      workerId,
      userId,
      offeringId: 1,
      weekday,
      time,
      startDate: dayStart,
      active: true,
    });
    const seriesId = result.insertId;

    try {
      const eventId = await this.createRecurringGoogleEvent(workerId, userId, firstOccurrence);
      if (eventId) {
        await this.db
          .update(fixedSeries)
          .set({ googleEventId: eventId })
          .where(eq(fixedSeries.id, seriesId));
      }
    } catch (error) {
      log.warn('createFixedSeries: evento recorrente Google falhou (série mantida)', {
        workerId,
        userId,
        error: error instanceof Error ? error.message : error,
      });
    }

    return { seriesId };
  }

  /**
   * Projeta as ocorrências das séries fixas ativas dentro de [rangeStart,
   * rangeEnd), SEM materializar nada. Respeita `startDate`, exceções e pula
   * horários já ocupados por uma linha real (para não duplicar com agendamentos
   * avulsos nem com ocorrências já materializadas/remarcadas). Filtra por worker
   * (disponibilidade/agenda) e/ou por cliente (meus horários).
   */
  async expandSeriesInRange(
    filter: { workerId?: number; userId?: number },
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<
    { seriesId: number; userId: number; workerId: number; offeringId: number; datetime: Date }[]
  > {
    if (rangeEnd.getTime() <= rangeStart.getTime()) return [];

    const conds = [eq(fixedSeries.active, true)];
    if (filter.workerId !== undefined) conds.push(eq(fixedSeries.workerId, filter.workerId));
    if (filter.userId !== undefined) conds.push(eq(fixedSeries.userId, filter.userId));

    const series = await this.db
      .select()
      .from(fixedSeries)
      .where(and(...conds));
    if (series.length === 0) return [];

    const seriesIds = series.map((s) => s.id);
    const exRows = await this.db
      .select()
      .from(fixedSeriesExceptions)
      .where(inArray(fixedSeriesExceptions.seriesId, seriesIds));
    const exceptionSet = new Set(
      exRows.map((e) => `${e.seriesId}|${this.startOfDayBR(e.date).getTime()}`),
    );

    // Slots já ocupados por linhas reais dos workers envolvidos (não duplicar).
    const workerIds = [
      ...new Set(series.map((s) => s.workerId).filter((w): w is number => w != null)),
    ];
    const occupied = new Set<string>();
    if (workerIds.length > 0) {
      const realRows = await this.db
        .select({ workerId: appointments.workerId, datetime: appointments.datetime })
        .from(appointments)
        .where(
          and(
            inArray(appointments.workerId, workerIds),
            gte(appointments.datetime, rangeStart),
            lt(appointments.datetime, rangeEnd),
          ),
        );
      for (const r of realRows) {
        if (r.workerId != null) occupied.add(`${r.workerId}|${r.datetime.getTime()}`);
      }
    }

    const firstDay = this.startOfDayBR(rangeStart);
    const numDays = Math.ceil((rangeEnd.getTime() - firstDay.getTime()) / ONE_DAY_MS) + 1;

    const out: {
      seriesId: number;
      userId: number;
      workerId: number;
      offeringId: number;
      datetime: Date;
    }[] = [];
    for (const s of series) {
      if (s.workerId == null) continue;
      const seriesStart = this.startOfDayBR(s.startDate);
      for (let offset = 0; offset < numDays; offset++) {
        const dayStart = new Date(firstDay.getTime() + offset * ONE_DAY_MS);
        if (dayStart.getDay() !== s.weekday) continue;
        if (dayStart.getTime() < seriesStart.getTime()) continue;
        const occ = this.combineDateAndTime(dayStart, `${s.time}:00`);
        if (occ.getTime() < rangeStart.getTime() || occ.getTime() >= rangeEnd.getTime()) continue;
        if (exceptionSet.has(`${s.id}|${dayStart.getTime()}`)) continue;
        if (occupied.has(`${s.workerId}|${occ.getTime()}`)) continue;
        out.push({
          seriesId: s.id,
          userId: s.userId,
          workerId: s.workerId,
          offeringId: s.offeringId,
          datetime: occ,
        });
      }
    }
    return out;
  }

  /**
   * Materializa uma ocorrência projetada como linha real em `appointment`,
   * gravando exceção na data original (para a projeção parar de gerá-la). Usada
   * quando o cliente/barbeiro remarca ou cancela UMA semana da série. Se
   * `newDatetime` for informado (remarcação), a linha fica no novo horário e
   * ganha um evento avulso no Google; a instância original do evento recorrente
   * é removida (best-effort). Retorna a linha criada.
   */
  async materializeOccurrence(
    seriesId: number,
    originalDatetime: Date,
    newDatetime?: Date,
  ): Promise<{ id: number; datetime: Date }> {
    const [series] = await this.db
      .select()
      .from(fixedSeries)
      .where(eq(fixedSeries.id, seriesId));
    if (!series) throw new NotFoundException('Fixed series not found');

    const target = newDatetime ?? originalDatetime;
    const originalDay = this.startOfDayBR(originalDatetime);

    // Exceção na data original (idempotente via unique series+date).
    await this.db
      .insert(fixedSeriesExceptions)
      .values({ seriesId, date: originalDay })
      .onDuplicateKeyUpdate({ set: { date: originalDay } });

    const [result] = await this.db.insert(appointments).values({
      userId: series.userId,
      workerId: series.workerId,
      offeringId: series.offeringId,
      fixed: true,
      fixedSeriesId: seriesId,
      datetime: target,
    });
    const id = result.insertId;

    // Google (best-effort): tira a instância original do evento recorrente e,
    // se remarcado, cria um evento avulso no novo horário.
    if (series.workerId && series.googleEventId) {
      await this.cancelRecurringInstance(series.workerId, series.googleEventId, originalDatetime);
    }
    if (series.workerId && newDatetime) {
      try {
        const eventId = await this.createGoogleEvent(
          series.workerId,
          series.userId,
          formatBrazil(target),
        );
        if (eventId) {
          await this.db
            .update(appointments)
            .set({ googleEventId: eventId })
            .where(eq(appointments.id, id));
        }
      } catch (error) {
        log.warn('materializeOccurrence: evento Google avulso falhou (linha mantida)', {
          seriesId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    return { id, datetime: target };
  }

  /** Cria um evento recorrente semanal (RRULE WEEKLY) no Google Calendar. */
  async createRecurringGoogleEvent(
    workerId: number,
    userId: number,
    firstOccurrence: Date,
  ): Promise<string | null> {
    const userName = await this.userService.getNameById(userId);
    if (!userName) {
      throw new NotFoundException('User not found');
    }

    const googleAccount = await this.googleAccountService.findUnique(workerId);
    if (!googleAccount) return null;

    const calendar = this.googleService.getCalendarClient(googleAccount.googleRefreshToken);
    if (!calendar) return null;

    const startIso = formatBrazil(firstOccurrence);
    const endIso = formatBrazil(new Date(firstOccurrence.getTime() + SLOT_DURATION_MS));

    const { data } = await calendar.events.insert({
      calendarId: googleAccount.googleCalendarId,
      requestBody: {
        summary: `Corte - ${userName} (fixo)`,
        start: { dateTime: startIso, timeZone: 'America/Sao_Paulo' },
        end: { dateTime: endIso, timeZone: 'America/Sao_Paulo' },
        recurrence: ['RRULE:FREQ=WEEKLY'],
        reminders: { useDefault: false, overrides: [] },
        extendedProperties: { private: { type: 'fixed_series' } },
      },
    });

    return data.id ?? null;
  }

  /**
   * Remove UMA instância de um evento recorrente do Google (best-effort). Usado
   * ao materializar/cancelar uma semana isolada da série, para o Google não
   * exibir a ocorrência recorrente junto com a linha materializada.
   */
  private async cancelRecurringInstance(
    workerId: number,
    recurringEventId: string,
    occurrence: Date,
  ): Promise<void> {
    try {
      const googleAccount = await this.googleAccountService.findUnique(workerId);
      if (!googleAccount) return;

      const calendar = this.googleService.getCalendarClient(googleAccount.googleRefreshToken);
      if (!calendar) return;

      const { data } = await calendar.events.instances({
        calendarId: googleAccount.googleCalendarId,
        eventId: recurringEventId,
        timeMin: new Date(occurrence.getTime() - 60 * 1000).toISOString(),
        timeMax: new Date(occurrence.getTime() + SLOT_DURATION_MS).toISOString(),
        maxResults: 5,
      });

      for (const inst of data.items ?? []) {
        const startStr = inst.start?.dateTime;
        if (!startStr || !inst.id) continue;
        if (new Date(startStr).getTime() === occurrence.getTime()) {
          await calendar.events.delete({
            calendarId: googleAccount.googleCalendarId,
            eventId: inst.id,
          });
          return;
        }
      }
    } catch (error) {
      log.warn('cancelRecurringInstance: falha ao cancelar instância recorrente', {
        workerId,
        recurringEventId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /** Séries fixas ativas de um cliente, com a próxima ocorrência projetada de cada. */
  async findActiveSeriesByUser(userId: number): Promise<{ seriesId: number; next: Date }[]> {
    const now = new Date();
    const horizonEnd = new Date(now.getTime() + BOOKING_WINDOW_DAYS * ONE_DAY_MS);
    const occ = await this.expandSeriesInRange({ userId }, now, horizonEnd);

    const earliest = new Map<number, Date>();
    for (const o of occ) {
      const cur = earliest.get(o.seriesId);
      if (!cur || o.datetime < cur) earliest.set(o.seriesId, o.datetime);
    }
    return [...earliest.entries()].map(([seriesId, next]) => ({ seriesId, next }));
  }

  /**
   * "Desfixa" uma série: marca como inativa (para de projetar), remove o evento
   * recorrente do Google e apaga as ocorrências FUTURAS já materializadas
   * (linhas reais + seus eventos avulsos). As linhas passadas ficam como
   * histórico. Retorna quantas ocorrências futuras materializadas foram removidas.
   */
  async cancelSeriesFromNow(seriesId: number): Promise<number> {
    const now = new Date();
    const [series] = await this.db
      .select()
      .from(fixedSeries)
      .where(eq(fixedSeries.id, seriesId));
    if (!series) return 0;

    const future = await this.db
      .select()
      .from(appointments)
      .where(and(eq(appointments.fixedSeriesId, seriesId), gte(appointments.datetime, now)));
    for (const row of future) {
      if (row.googleEventId && row.workerId) {
        await this.deleteGoogleEvent(row.workerId, row.googleEventId);
      }
    }

    if (series.googleEventId && series.workerId) {
      await this.deleteGoogleEvent(series.workerId, series.googleEventId);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(appointments)
        .where(and(eq(appointments.fixedSeriesId, seriesId), gte(appointments.datetime, now)));
      await tx
        .update(fixedSeries)
        .set({ active: false, googleEventId: null })
        .where(eq(fixedSeries.id, seriesId));
    });

    return future.length;
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

    // Séries fixas: ocorrências projetadas também ocupam o slot (sem materializar).
    const projected = await this.expandSeriesInRange({ workerId }, rangeStart, effectiveEnd);

    const bookedSet = new Set([
      ...booked.map((b) => b.datetime.getTime()),
      ...projected.map((p) => p.datetime.getTime()),
    ]);
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
