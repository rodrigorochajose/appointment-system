import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentService } from './appointment.service';
import { log } from '@/common/logger';

/**
 * Mantém vivos os canais de push do Google Calendar.
 *
 * O canal dura até 7 dias (Google pode reduzir); renovamos incondicionalmente
 * 1x/dia, bem dentro da margem, então não há necessidade de checar expiração
 * antes de renovar. Roda no próprio app (portável p/ qualquer host). No Render
 * free, depende do serviço estar acordado (UptimeRobot) — em host sempre-ligado
 * roda naturalmente. A renovação é idempotente (troca o canal antigo pelo novo).
 */
@Injectable()
export class GoogleWatchScheduler implements OnModuleInit {
  constructor(private readonly appointmentService: AppointmentService) {}

  /** Garante canais ativos no boot (ex.: após deploy/restart). */
  async onModuleInit(): Promise<void> {
    await this.renew('boot');
  }

  /** Renova todo dia, incondicionalmente. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron(): Promise<void> {
    await this.renew('cron');
  }

  private async renew(trigger: string): Promise<void> {
    try {
      const results = await this.appointmentService.ensureWatchChannels();
      log.info('GoogleWatchScheduler: canais verificados', { trigger, results });
    } catch (err) {
      log.error(
        'GoogleWatchScheduler: falha ao garantir canais',
        err instanceof Error ? err : { trigger, err },
      );
    }
  }
}
