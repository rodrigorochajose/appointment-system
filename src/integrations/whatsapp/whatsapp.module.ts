import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { ConversationStateService } from './conversation-state/conversation-state.service';
import { UserModule } from '@/modules/user/user.module';
import { AppointmentModule } from '@/modules/appointment/appointment.module';

@Module({
  imports: [UserModule, AppointmentModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, ConversationStateService],
  exports: [WhatsAppService, ConversationStateService],
})
export class WhatsAppModule {}
