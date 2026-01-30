import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentResponseDto } from './dto/appointment-response.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('appointment')
@UseGuards(AuthGuard)
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post()
  async create(@Body() data: CreateAppointmentDto): Promise<AppointmentResponseDto> {
    return this.appointmentService.create(data);
  }

  @Get()
  async findMany(): Promise<AppointmentResponseDto[]> {
    return this.appointmentService.findMany();
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
