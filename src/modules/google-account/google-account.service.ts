import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CreateGoogleAccountDto } from './dto/create-google-account.dto';
import { DATABASE_CONNECTION } from '@/database/database.module';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { GoogleAccountResponseDto } from './dto/google-account-response.dto';
import { handleDatabaseError } from '@/common/helpers/database-error-handler';
import { googleAccounts } from '@/database/schemas';
import { eq } from 'drizzle-orm';

@Injectable()
export class GoogleAccountService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: MySql2Database,
  ) {}

  async create(data: CreateGoogleAccountDto): Promise<GoogleAccountResponseDto> {
    try {
      const [result] = await this.db.insert(googleAccounts).values(data);

      const [googleAccount] = await this.db
        .select()
        .from(googleAccounts)
        .where(eq(googleAccounts.id, result.insertId));

      return googleAccount;
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async findUnique(id: number): Promise<GoogleAccountResponseDto> {
    const [googleAccount] = await this.db
      .select()
      .from(googleAccounts)
      .where(eq(googleAccounts.id, id));

    if (!googleAccount) {
      throw new NotFoundException('Google Account not found');
    }

    return googleAccount;
  }

  async saveGoogleCredentials(data: { workerId: number; refreshToken: string; email: string }) {
    await this.db
      .insert(googleAccounts)
      .values({
        workerId: data.workerId,
        googleCalendarId: 'primary',
        googleEmail: data.email,
        googleRefreshToken: data.refreshToken,
      })
      .onDuplicateKeyUpdate({
        set: {
          googleRefreshToken: data.refreshToken,
          googleEmail: data.email,
          updatedAt: new Date(),
        },
      });
  }
}
