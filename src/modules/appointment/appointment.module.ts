import { Module } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { AppointmentController } from './appointment.controller';
import { GoogleModule } from '@/integrations/google/google.module';
import { GoogleAccountModule } from '../google-account/google-account.module';
import { UserModule } from '../user/user.module';
import { ScheduleModule } from '../schedule/schedule.module';

@Module({
  imports: [UserModule, GoogleAccountModule, GoogleModule, ScheduleModule],
  providers: [AppointmentService],
  controllers: [AppointmentController],
  exports: [AppointmentService],
})
export class AppointmentModule {}
