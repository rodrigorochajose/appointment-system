import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE_CONNECTION } from 'src/database/database.module';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import { schedules } from 'src/database/schemas';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { ScheduleResponseDto } from './dto/schedule-response.dto';
import { ApiResponse } from 'src/common/interface/api-response.interface';
import { handleDatabaseError } from 'src/common/helpers/database-error-handler';

@Injectable()
export class ScheduleService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: MySql2Database,
  ) {}

  async create(data: CreateScheduleDto): Promise<ScheduleResponseDto> {
    try {
      const [result] = await this.db.insert(schedules).values(data);
      const [schedule] = await this.db
        .select()
        .from(schedules)
        .where(eq(schedules.id, result.insertId));
      return schedule;
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async findMany(): Promise<ScheduleResponseDto[]> {
    return await this.db.select().from(schedules);
  }

  async findUnique(id: number): Promise<ScheduleResponseDto> {
    const [schedule] = await this.db.select().from(schedules).where(eq(schedules.id, id));

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    return schedule;
  }

  async findUniqueByWorkerId(workerId: number): Promise<ScheduleResponseDto> {
    const [schedule] = await this.db
      .select()
      .from(schedules)
      .where(eq(schedules.workerId, workerId));

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    return schedule;
  }

  async update(id: number, data: UpdateScheduleDto): Promise<ScheduleResponseDto> {
    try {
      await this.db.update(schedules).set(data).where(eq(schedules.id, id));
      return this.findUnique(id);
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async delete(id: number): Promise<ApiResponse> {
    try {
      await this.findUnique(id); // Verifica se existe
      await this.db.delete(schedules).where(eq(schedules.id, id));
      return { message: 'Schedule deleted successfully' };
    } catch (error) {
      handleDatabaseError(error);
    }
  }
}
