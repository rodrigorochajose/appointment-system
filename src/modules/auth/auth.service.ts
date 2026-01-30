import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthDto } from './dto/auth.dto';
import { DATABASE_CONNECTION } from 'src/database/database.module';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import { workers } from 'src/database/schemas';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: MySql2Database,
    private readonly jwtService: JwtService,
  ) {}

  async signIn(data: AuthDto): Promise<{ access_token: string }> {
    const [worker] = await this.db
      .select()
      .from(workers)
      .where(eq(workers.email, data.email))
      .limit(1);

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    const passwordMatch = await bcrypt.compare(data.password, worker.password);

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid Credentials');
    }

    const payload = { sub: worker.id };

    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}
