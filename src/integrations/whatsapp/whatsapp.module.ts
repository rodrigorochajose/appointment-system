import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { ConversationDataService } from './conversation-data/conversation-data.service';
import { WhatsAppMessageHandlers } from './handlers';
import { UserModule } from '@/modules/user/user.module';
import { AppointmentModule } from '@/modules/appointment/appointment.module';

@Module({
  imports: [UserModule, AppointmentModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, ConversationDataService, WhatsAppMessageHandlers],
  exports: [WhatsAppService, ConversationDataService],
})
export class WhatsAppModule {}
