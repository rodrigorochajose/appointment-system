import { Module } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { AppointmentController } from './appointment.controller';
import { CalendarSyncController } from './calendar-sync.controller';
import { GoogleNotificationsController } from './google-notifications.controller';
import { GoogleWatchScheduler } from './google-watch.scheduler';
import { FixedSeriesScheduler } from './fixed-series.scheduler';
import { GoogleModule } from '@/integrations/google/google.module';
import { GoogleAccountModule } from '../google-account/google-account.module';
import { UserModule } from '../user/user.module';
import { ScheduleModule } from '../schedule/schedule.module';

@Module({
  imports: [UserModule, GoogleAccountModule, GoogleModule, ScheduleModule],
  providers: [AppointmentService, GoogleWatchScheduler, FixedSeriesScheduler],
  controllers: [AppointmentController, CalendarSyncController, GoogleNotificationsController],
  exports: [AppointmentService],
})
export class AppointmentModule {}
