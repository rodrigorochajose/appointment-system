import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE_CONNECTION } from 'src/database/database.module';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { and, eq, sql } from 'drizzle-orm';
import { users } from 'src/database/schemas';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { ApiResponse } from 'src/common/interface/api-response.interface';
import { handleDatabaseError } from 'src/common/helpers/database-error-handler';

@Injectable()
export class UserService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: MySql2Database,
  ) {}

  async create(data: CreateUserDto): Promise<UserResponseDto> {
    try {
      const [result] = await this.db.insert(users).values(data);
      const [user] = await this.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          workerId: users.workerId,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, result.insertId));
      return user;
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async findMany(): Promise<UserResponseDto[]> {
    return await this.db.select().from(users);
  }

  async getNameById(id: number): Promise<string> {
    const user = await this.findUnique(id);

    return user.name;
  }

  async findUnique(id: number): Promise<UserResponseDto> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByPhone(phone: string): Promise<UserResponseDto | null> {
    const [user] = await this.db.select().from(users).where(eq(users.phone, phone));

    return user;
  }

  /**
   * Busca clientes por nome aproximado, case-insensitive independente da
   * collation da tabela (força `LOWER()` dos dois lados, já que o `LIKE` do
   * MySQL só ignora maiúsculas/minúsculas sozinho em collations `_ci`).
   * O termo é quebrado em palavras e cada uma precisa aparecer no nome (AND),
   * então "steve" ou "steve jobs" casam "Steve Jobs Da Silva" independente da
   * ordem das palavras intermediárias.
   */
  async findByNameLike(name: string, limit = 25): Promise<UserResponseDto[]> {
    const tokens = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    return await this.db
      .select()
      .from(users)
      .where(and(...tokens.map((t) => sql`LOWER(${users.name}) LIKE ${`%${t}%`}`)))
      .limit(limit);
  }

  async update(id: number, data: UpdateUserDto): Promise<UserResponseDto> {
    try {
      await this.db.update(users).set(data).where(eq(users.id, id));
      return this.findUnique(id);
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async delete(id: number): Promise<ApiResponse> {
    try {
      await this.findUnique(id); // Verifica se existe
      await this.db.delete(users).where(eq(users.id, id));
      return { message: 'User deleted successfully' };
    } catch (error) {
      handleDatabaseError(error);
    }
  }
}
