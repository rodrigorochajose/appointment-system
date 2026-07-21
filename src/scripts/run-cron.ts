import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AppointmentReminderScheduler } from '../integrations/whatsapp/appointment-reminder.scheduler';
import { GoogleWatchScheduler } from '../modules/appointment/google-watch.scheduler';
import { log } from '../common/logger';

/**
 * Dispara manualmente o `handleCron()` de um scheduler, sem esperar o horário
 * agendado. Sobe só o contexto do Nest (sem abrir porta HTTP), roda o método
 * de verdade — mesma lógica, mesmo banco, mesmos efeitos colaterais reais
 * (envia WhatsApp de verdade / chama a API do Google Calendar de verdade) — e
 * encerra.
 *
 * Uso: npx tsx src/scripts/run-cron.ts <reminder|google-watch>
 */
async function main() {
  const target = process.argv[2];

  if (target !== 'reminder' && target !== 'google-watch') {
    console.error('Uso: npx tsx src/scripts/run-cron.ts <reminder|google-watch>');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    if (target === 'reminder') {
      await app.get(AppointmentReminderScheduler).handleCron();
    } else {
      await app.get(GoogleWatchScheduler).handleCron();
    }
    log.info('run-cron: execução manual concluída', { target });
  } finally {
    await app.close();
  }
}

main();
