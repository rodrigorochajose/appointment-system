import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { WorkerResponseDto } from './dto/worker-response.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('worker')
export class WorkerController {
  constructor(private readonly workerService: WorkerService) {}

  @Post()
  async create(@Body() data: CreateWorkerDto): Promise<WorkerResponseDto> {
    return this.workerService.create(data);
  }

  @UseGuards(AuthGuard)
  @Get()
  async findMany(): Promise<WorkerResponseDto[]> {
    return this.workerService.findMany();
  }

  @UseGuards(AuthGuard)
  @Get(':id')
  async findUnique(@Param('id') id: string): Promise<WorkerResponseDto> {
    return this.workerService.findUnique(Number(id));
  }

  @UseGuards(AuthGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() data: UpdateWorkerDto): Promise<WorkerResponseDto> {
    return this.workerService.update(Number(id), data);
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string): Promise<object> {
    return this.workerService.delete(Number(id));
  }
}
