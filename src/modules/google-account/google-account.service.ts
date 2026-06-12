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

  /** Lista todas as contas Google conectadas (usado pela sincronização). */
  async findAll(): Promise<GoogleAccountResponseDto[]> {
    return this.db.select().from(googleAccounts);
  }

  /** Persiste o syncToken incremental de uma conta (por workerId). */
  async updateSyncToken(workerId: number, syncToken: string | null): Promise<void> {
    await this.db
      .update(googleAccounts)
      .set({ syncToken, updatedAt: new Date() })
      .where(eq(googleAccounts.workerId, workerId));
  }

  /** Persiste os dados do canal de push (events.watch) de uma conta. */
  async updateWatch(
    workerId: number,
    watch: { channelId: string | null; resourceId: string | null; expiration: Date | null },
  ): Promise<void> {
    await this.db
      .update(googleAccounts)
      .set({
        watchChannelId: watch.channelId,
        watchResourceId: watch.resourceId,
        watchExpiration: watch.expiration,
        updatedAt: new Date(),
      })
      .where(eq(googleAccounts.workerId, workerId));
  }

  /** Localiza a conta dona de um canal de push (usado no webhook). */
  async findByChannelId(channelId: string): Promise<GoogleAccountResponseDto | undefined> {
    const [account] = await this.db
      .select()
      .from(googleAccounts)
      .where(eq(googleAccounts.watchChannelId, channelId));
    return account;
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
