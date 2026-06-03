import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AppointmentService, DailyAvailability } from './appointment.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentResponseDto } from './dto/appointment-response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { parseBrazilDateTime } from '@/common/helpers/brazil-date';

@Controller('appointment')
@UseGuards(AuthGuard)
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post()
  async create(@Body() data: CreateAppointmentDto): Promise<AppointmentResponseDto> {
    return this.appointmentService.create(data);
  }

  @Get('available-slots')
  async availableSlots(
    @Query('workerId') workerIdRaw: string,
    @Query('from') fromRaw: string,
    @Query('to') toRaw: string,
    @Query('limit') limitRaw?: string,
  ): Promise<DailyAvailability[]> {
    const workerId = Number(workerIdRaw);
    if (!Number.isInteger(workerId) || workerId <= 0) {
      throw new BadRequestException('workerId deve ser um inteiro positivo');
    }

    if (!fromRaw || !toRaw) {
      throw new BadRequestException('Parâmetros "from" e "to" são obrigatórios');
    }

    let from: Date;
    let to: Date;
    try {
      from = parseBrazilDateTime(fromRaw);
      to = parseBrazilDateTime(toRaw);
    } catch {
      throw new BadRequestException(
        'Parâmetros "from" e "to" devem ser datas válidas (ex: 2026-05-21 ou 2026-05-21T15:00:00)',
      );
    }

    let limit: number | undefined;
    if (limitRaw !== undefined) {
      const parsed = Number(limitRaw);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new BadRequestException('limit deve ser um inteiro não-negativo');
      }
      limit = parsed;
    }

    return this.appointmentService.getAvailableSlots(workerId, from, to, limit);
  }

  @Get(':id')
  async findUnique(@Param('id') id: string): Promise<AppointmentResponseDto> {
    return this.appointmentService.findUnique(Number(id));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() data: UpdateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    return this.appointmentService.update(Number(id), data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<object> {
    return this.appointmentService.delete(Number(id));
  }
}
