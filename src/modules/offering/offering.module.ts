import { Module } from '@nestjs/common';
import { OfferingService } from './offering.service';
import { OfferingController } from './offering.controller';

@Module({
  providers: [OfferingService],
  controllers: [OfferingController],
  exports: [OfferingService],
})
export class OfferingModule {}
