import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { WorkerModule } from './modules/worker/worker.module';
import { OfferingModule } from './modules/offering/offering.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { AppointmentModule } from './modules/appointment/appointment.module';
import { UnavailablePeriodModule } from './modules/unavailable-period/unavailable-period.module';
import { GoogleAccountModule } from './modules/google-account/google-account.module';
import { GoogleModule } from './integrations/google/google.module';
import { WhatsAppModule } from './integrations/whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    NestScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UserModule,
    WorkerModule,
    OfferingModule,
    ScheduleModule,
    AppointmentModule,
    UnavailablePeriodModule,
    GoogleAccountModule,
    GoogleModule,
    WhatsAppModule,
  ],
})
export class AppModule {}
