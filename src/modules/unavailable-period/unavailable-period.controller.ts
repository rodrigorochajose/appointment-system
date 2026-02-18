import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UnavailablePeriodService } from './unavailable-period.service';
import { CreateUnavailablePeriodDto } from './dto/create-unavailable-period.dto';
import { UpdateUnavailablePeriodDto } from './dto/update-unavailable-period.dto';
import { UnavailablePeriodResponseDto } from './dto/unavailable-period-response.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('unavailable-period')
@UseGuards(AuthGuard)
export class UnavailablePeriodController {
  constructor(private readonly unavailablePeriodService: UnavailablePeriodService) {}

  @Post()
  async create(@Body() data: CreateUnavailablePeriodDto): Promise<UnavailablePeriodResponseDto> {
    return this.unavailablePeriodService.create(data);
  }

  @Get()
  async findMany(): Promise<UnavailablePeriodResponseDto[]> {
    return this.unavailablePeriodService.findMany();
  }

  @Get(':id')
  async findUnique(@Param('id') id: string): Promise<UnavailablePeriodResponseDto> {
    return this.unavailablePeriodService.findUnique(Number(id));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() data: UpdateUnavailablePeriodDto,
  ): Promise<UnavailablePeriodResponseDto> {
    return this.unavailablePeriodService.update(Number(id), data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<object> {
    return this.unavailablePeriodService.delete(Number(id));
  }
}
