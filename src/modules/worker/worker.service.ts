import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE_CONNECTION } from 'src/database/database.module';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import { workers } from 'src/database/schemas';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { WorkerResponseDto } from './dto/worker-response.dto';
import { ApiResponse } from 'src/common/interface/api-response.interface';
import { handleDatabaseError } from 'src/common/helpers/database-error-handler';
import * as bcrypt from 'bcrypt';

@Injectable()
export class WorkerService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: MySql2Database,
  ) {}

  async create(data: CreateWorkerDto): Promise<WorkerResponseDto> {
    try {
      const hashPassword = await bcrypt.hash(data.password, 10);
      const [result] = await this.db.insert(workers).values({ ...data, password: hashPassword });

      const [worker] = await this.db
        .select({
          id: workers.id,
          name: workers.name,
          email: workers.email,
          createdAt: workers.createdAt,
          updatedAt: workers.updatedAt,
        })
        .from(workers)
        .where(eq(workers.id, result.insertId));

      return worker;
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async findMany(): Promise<WorkerResponseDto[]> {
    return await this.db
      .select({
        id: workers.id,
        name: workers.name,
        email: workers.email,
        createdAt: workers.createdAt,
        updatedAt: workers.updatedAt,
      })
      .from(workers);
  }

  async findUnique(id: number): Promise<WorkerResponseDto> {
    const [worker] = await this.db
      .select({
        id: workers.id,
        name: workers.name,
        email: workers.email,
        createdAt: workers.createdAt,
        updatedAt: workers.updatedAt,
      })
      .from(workers)
      .where(eq(workers.id, id));

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    return worker;
  }

  async update(id: number, data: UpdateWorkerDto): Promise<WorkerResponseDto> {
    try {
      const updateData: any = { ...data };
      if (data.password) {
        updateData.password = await bcrypt.hash(data.password, 10);
      }

      await this.db.update(workers).set(updateData).where(eq(workers.id, id));
      return this.findUnique(id);
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async delete(id: number): Promise<ApiResponse> {
    try {
      await this.findUnique(id);
      await this.db.delete(workers).where(eq(workers.id, id));
      return { message: 'Worker deleted successfully' };
    } catch (error) {
      handleDatabaseError(error);
    }
  }
}
