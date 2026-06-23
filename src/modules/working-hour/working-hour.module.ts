import { Module } from '@nestjs/common';
import { WorkingHourService } from './working-hour.service';

@Module({
  providers: [WorkingHourService],
  exports: [WorkingHourService],
})
export class WorkingHourModule {}
