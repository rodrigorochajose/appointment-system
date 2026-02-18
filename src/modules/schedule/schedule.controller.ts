import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { ScheduleResponseDto } from './dto/schedule-response.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('schedule')
@UseGuards(AuthGuard)
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Post()
  async create(@Body() data: CreateScheduleDto): Promise<ScheduleResponseDto> {
    return this.scheduleService.create(data);
  }

  @Get()
  async findMany(): Promise<ScheduleResponseDto[]> {
    return this.scheduleService.findMany();
  }

  @Get(':id')
  async findUnique(@Param('id') id: string): Promise<ScheduleResponseDto> {
    return this.scheduleService.findUnique(Number(id));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() data: UpdateScheduleDto,
  ): Promise<ScheduleResponseDto> {
    return this.scheduleService.update(Number(id), data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<object> {
    return this.scheduleService.delete(Number(id));
  }
}
