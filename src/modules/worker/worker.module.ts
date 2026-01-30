import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { WorkerController } from './worker.controller';
import { GoogleModule } from '@/integrations/google/google.module';

@Module({
  imports: [GoogleModule],
  providers: [WorkerService],
  controllers: [WorkerController],
  exports: [WorkerService],
})
export class WorkerModule {}
