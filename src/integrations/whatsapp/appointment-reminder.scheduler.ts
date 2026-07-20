import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AppointmentService } from '@/modules/appointment/appointment.service';
import { UserService } from '@/modules/user/user.service';
import { WhatsAppService } from './whatsapp.service';
import { formatBrazil, parseBrazilDateTime } from '@/common/helpers/brazil-date';
import { log } from '@/common/logger';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Template aprovado no Meta Business Manager (categoria UTILITY). */
const TEMPLATE_NAME = 'appointment_reminder';
const TEMPLATE_LANGUAGE = 'pt_BR';

/**
 * Envia um lembrete por WhatsApp aos clientes com agendamento no dia seguinte.
 *
 * Roda 1x/dia às 20h (horário de Brasília). Como é um disparo outbound puro
 * (não nasce de um webhook recebido), o `phone_number_id` do WhatsApp Business
 * vem de env (`WPP_PHONE_NUMBER_ID`) em vez do payload de entrada.
 */
@Injectable()
export class AppointmentReminderScheduler {
  constructor(
    private readonly appointmentService: AppointmentService,
    private readonly userService: UserService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  @Cron('0 20 * * *', { timeZone: 'America/Sao_Paulo' })
  async handleCron(): Promise<void> {
    const phoneNumberId = process.env.WPP_PHONE_NUMBER_ID;
    if (!phoneNumberId) {
      log.error('AppointmentReminderScheduler: WPP_PHONE_NUMBER_ID não configurado.');
      return;
    }

    const tomorrowStart = this.startOfDayBR(new Date(Date.now() + ONE_DAY_MS));
    const occurrences = await this.appointmentService.findManyOnDay(tomorrowStart);

    log.info('AppointmentReminderScheduler: lembretes a enviar', { count: occurrences.length });

    for (const occ of occurrences) {
      try {
        const user = await this.userService.findUnique(occ.userId);
        const firstName = user.name.trim().split(/\s+/)[0];
        const [datePart, timePart] = formatBrazil(occ.datetime).split('T');
        const [, mm, dd] = datePart.split('-');

        await this.whatsAppService.sendTemplateMessage(
          phoneNumberId,
          user.phone,
          TEMPLATE_NAME,
          TEMPLATE_LANGUAGE,
          [
            { name: 'firstname', value: firstName },
            { name: 'date', value: `${dd}/${mm}` },
            { name: 'hour', value: timePart.slice(0, 5) },
          ],
        );
      } catch (err) {
        log.error(
          'AppointmentReminderScheduler: falha ao enviar lembrete',
          err instanceof Error ? err : { userId: occ.userId, err },
        );
      }
    }
  }

  private startOfDayBR(date: Date): Date {
    const ymd = formatBrazil(date).slice(0, 10);
    return parseBrazilDateTime(`${ymd}T00:00:00`);
  }
}
