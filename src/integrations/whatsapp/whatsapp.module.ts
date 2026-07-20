import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { ConversationDataService } from './conversation-data/conversation-data.service';
import { WhatsAppMessageHandlers } from './handlers';
import { AppointmentReminderScheduler } from './appointment-reminder.scheduler';
import { UserModule } from '@/modules/user/user.module';
import { AppointmentModule } from '@/modules/appointment/appointment.module';
import { ScheduleModule } from '@/modules/schedule/schedule.module';
import { UnavailablePeriodModule } from '@/modules/unavailable-period/unavailable-period.module';
import { WorkingHourModule } from '@/modules/working-hour/working-hour.module';

@Module({
  imports: [
    UserModule,
    AppointmentModule,
    ScheduleModule,
    UnavailablePeriodModule,
    WorkingHourModule,
  ],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppService,
    ConversationDataService,
    WhatsAppMessageHandlers,
    AppointmentReminderScheduler,
  ],
  exports: [WhatsAppService, ConversationDataService],
})
export class WhatsAppModule {}
