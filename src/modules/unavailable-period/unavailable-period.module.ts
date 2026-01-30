import { Module } from '@nestjs/common';
import { UnavailablePeriodService } from './unavailable-period.service';
import { UnavailablePeriodController } from './unavailable-period.controller';

@Module({
  providers: [UnavailablePeriodService],
  controllers: [UnavailablePeriodController],
  exports: [UnavailablePeriodService],
})
export class UnavailablePeriodModule {}
