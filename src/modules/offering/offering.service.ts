import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE_CONNECTION } from 'src/database/database.module';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import { offerings } from 'src/database/schemas';
import { CreateOfferingDto } from './dto/create-offering.dto';
import { UpdateOfferingDto } from './dto/update-offering.dto';
import { OfferingResponseDto } from './dto/offering-response.dto';
import { ApiResponse } from 'src/common/interface/api-response.interface';
import { handleDatabaseError } from 'src/common/helpers/database-error-handler';

@Injectable()
export class OfferingService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: MySql2Database,
  ) {}

  async create(data: CreateOfferingDto): Promise<OfferingResponseDto> {
    try {
      const [result] = await this.db.insert(offerings).values(data);
      const [offering] = await this.db
        .select()
        .from(offerings)
        .where(eq(offerings.id, result.insertId));
      return offering;
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async findMany(): Promise<OfferingResponseDto[]> {
    return await this.db.select().from(offerings);
  }

  async findUnique(id: number): Promise<OfferingResponseDto> {
    const [offering] = await this.db
      .select()
      .from(offerings)
      .where(eq(offerings.id, id));

    if (!offering) {
      throw new NotFoundException('Offering not found');
    }

    return offering;
  }

  async update(
    id: number,
    data: UpdateOfferingDto,
  ): Promise<OfferingResponseDto> {
    try {
      await this.db.update(offerings).set(data).where(eq(offerings.id, id));
      return this.findUnique(id);
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async delete(id: number): Promise<ApiResponse> {
    try {
      await this.findUnique(id); // Verifica se existe
      await this.db.delete(offerings).where(eq(offerings.id, id));
      return { message: 'Offering deleted successfully' };
    } catch (error) {
      handleDatabaseError(error);
    }
  }
}
