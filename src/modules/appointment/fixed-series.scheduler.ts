import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentService } from './appointment.service';
import { log } from '@/common/logger';

/**
 * Mantém as "fixações" (clientes recorrentes) preenchidas até a borda da janela
 * de agendamento. Como a janela é rolante (avança um dia por dia), todo dia há
 * potencialmente uma nova semana a materializar no fim do horizonte.
 *
 * Roda no boot e uma vez por dia. A extensão é idempotente: só cria as semanas
 * que ainda não existem e pula horários já ocupados.
 */
@Injectable()
export class FixedSeriesScheduler implements OnModuleInit {
  constructor(private readonly appointmentService: AppointmentService) {}

  async onModuleInit(): Promise<void> {
    await this.extend('boot');
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleCron(): Promise<void> {
    await this.extend('cron');
  }

  private async extend(trigger: string): Promise<void> {
    try {
      const results = await this.appointmentService.extendFixedSeries();
      if (results.length > 0) {
        log.info('FixedSeriesScheduler: séries estendidas', { trigger, results });
      }
    } catch (err) {
      log.error(
        'FixedSeriesScheduler: falha ao estender séries',
        err instanceof Error ? err : { trigger, err },
      );
    }
  }
}
