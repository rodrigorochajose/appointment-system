import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE_CONNECTION } from 'src/database/database.module';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import { unavailablePeriods } from 'src/database/schemas';
import { CreateUnavailablePeriodDto } from './dto/create-unavailable-period.dto';
import { UpdateUnavailablePeriodDto } from './dto/update-unavailable-period.dto';
import { UnavailablePeriodResponseDto } from './dto/unavailable-period-response.dto';
import { ApiResponse } from 'src/common/interface/api-response.interface';
import { handleDatabaseError } from 'src/common/helpers/database-error-handler';

@Injectable()
export class UnavailablePeriodService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: MySql2Database,
  ) {}

  async create(
    data: CreateUnavailablePeriodDto,
  ): Promise<UnavailablePeriodResponseDto> {
    try {
      const [result] = await this.db.insert(unavailablePeriods).values({
        ...data,
        date: new Date(data.date),
        begin: new Date(data.begin),
        end: new Date(data.end),
      });
      const [unavailablePeriod] = await this.db
        .select()
        .from(unavailablePeriods)
        .where(eq(unavailablePeriods.id, result.insertId));
      return unavailablePeriod;
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async findMany(): Promise<UnavailablePeriodResponseDto[]> {
    return await this.db.select().from(unavailablePeriods);
  }

  async findUnique(id: number): Promise<UnavailablePeriodResponseDto> {
    const [unavailablePeriod] = await this.db
      .select()
      .from(unavailablePeriods)
      .where(eq(unavailablePeriods.id, id));

    if (!unavailablePeriod) {
      throw new NotFoundException('Unavailable period not found');
    }

    return unavailablePeriod;
  }

  async update(
    id: number,
    data: UpdateUnavailablePeriodDto,
  ): Promise<UnavailablePeriodResponseDto> {
    try {
      const updateData: any = { ...data };
      if (data.date) updateData.date = new Date(data.date);
      if (data.begin) updateData.begin = new Date(data.begin);
      if (data.end) updateData.end = new Date(data.end);

      await this.db
        .update(unavailablePeriods)
        .set(updateData)
        .where(eq(unavailablePeriods.id, id));
      return this.findUnique(id);
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async delete(id: number): Promise<ApiResponse> {
    try {
      await this.findUnique(id); // Verifica se existe
      await this.db
        .delete(unavailablePeriods)
        .where(eq(unavailablePeriods.id, id));
      return { message: 'Unavailable period deleted successfully' };
    } catch (error) {
      handleDatabaseError(error);
    }
  }
}
