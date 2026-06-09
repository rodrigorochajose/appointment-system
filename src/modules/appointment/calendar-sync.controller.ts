import { Controller, Headers, HttpCode, HttpStatus, Post, UnauthorizedException } from '@nestjs/common';
import { AppointmentService, CalendarSyncResult } from './appointment.service';
import { log } from '@/common/logger';

/**
 * Endpoint de sincronização reversa (Google Calendar -> banco).
 *
 * Protegido por um token compartilhado no header `x-sync-token` (GOOGLE_SYNC_TOKEN),
 * NÃO pelo AuthGuard de JWT — pensado para um cron externo (cron-job.org hoje,
 * Cloud Scheduler na migração). A mesma lógica serve a um push notification futuro.
 */
@Controller('sync')
export class CalendarSyncController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post('google')
  @HttpCode(HttpStatus.OK)
  async syncGoogle(
    @Headers('x-sync-token') token?: string,
  ): Promise<{ ok: true; results: CalendarSyncResult[] }> {
    const expected = process.env.GOOGLE_SYNC_TOKEN;

    if (!expected) {
      log.error('syncGoogle: GOOGLE_SYNC_TOKEN não configurado no servidor');
      throw new UnauthorizedException();
    }

    if (token !== expected) {
      log.warn('syncGoogle: token inválido no header x-sync-token');
      throw new UnauthorizedException();
    }

    const results = await this.appointmentService.syncAllCalendars();
    log.info('syncGoogle: sincronização concluída', { results });
    return { ok: true, results };
  }
}
