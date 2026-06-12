import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentService } from './appointment.service';
import { log } from '@/common/logger';

/**
 * Mantém vivos os canais de push do Google Calendar.
 *
 * Os canais expiram em dias; este cron interno renova os que estão perto de
 * expirar. Roda no próprio app (portável p/ qualquer host). No Render free,
 * depende do serviço estar acordado (UptimeRobot) — em host sempre-ligado roda
 * naturalmente. A renovação é idempotente: só renova quem realmente precisa.
 */
@Injectable()
export class GoogleWatchScheduler implements OnModuleInit {
  constructor(private readonly appointmentService: AppointmentService) {}

  /** Garante canais ativos no boot (ex.: após deploy/restart). */
  async onModuleInit(): Promise<void> {
    await this.renew('boot');
  }

  /** Renova periodicamente, com folga em relação ao TTL do canal. */
  @Cron(CronExpression.EVERY_6_HOURS)
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
