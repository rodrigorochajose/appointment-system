import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE_CONNECTION } from 'src/database/database.module';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import { appointments } from 'src/database/schemas';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentResponseDto } from './dto/appointment-response.dto';
import { ApiResponse } from 'src/common/interface/api-response.interface';
import { handleDatabaseError } from 'src/common/helpers/database-error-handler';
import { GoogleService } from '@/integrations/google/google.service';
import { GoogleAccountService } from '../google-account/google-account.service';
import { UserService } from '../user/user.service';
import { formatBrazil, parseBrazilDateTime } from '@/common/helpers/brazil-date';

@Injectable()
export class AppointmentService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: MySql2Database,
    private googleService: GoogleService,
    private googleAccountService: GoogleAccountService,
    private userService: UserService,
  ) {}

  async create(data: CreateAppointmentDto): Promise<null> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(appointments).values({
          offeringId: data.offeringId ?? 1,
          userId: data.userId,
          workerId: data.workerId,
          fixed: data.fixed ?? false,
          datetime: new Date(data.datetime),
        });

        await this.createGoogleEvent(data.workerId, data.userId, data.datetime);
      });

      return null;
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async createGoogleEvent(workerId: number, userId: number, start: string) {
    const userName = await this.userService.getNameById(userId);

    if (!userName) {
      throw new NotFoundException('User not found');
    }

    const googleAccount = await this.googleAccountService.findUnique(workerId);

    if (!googleAccount) {
      throw new NotFoundException('Google Account not found');
    }

    const calendar = this.googleService.getCalendarClient(googleAccount.googleRefreshToken);

    if (!calendar) {
      throw new NotFoundException('Calendar not found');
    }

    const startDate = parseBrazilDateTime(start);
    const endDate = formatBrazil(new Date(startDate.getTime() + 60 * 60 * 1000));

    await calendar.events.insert({
      calendarId: googleAccount.googleCalendarId,
      requestBody: {
        summary: `Corte - ${userName}`,
        start: {
          dateTime: start,
          timeZone: 'America/Sao_Paulo',
        },
        end: {
          dateTime: endDate,
          timeZone: 'America/Sao_Paulo',
        },
        reminders: {
          useDefault: false,
          overrides: [],
        },
      },
    });
  }

  async findMany(): Promise<AppointmentResponseDto[]> {
    return await this.db.select().from(appointments);
  }

  async findUnique(id: number): Promise<AppointmentResponseDto> {
    const [appointment] = await this.db.select().from(appointments).where(eq(appointments.id, id));

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  async update(id: number, data: UpdateAppointmentDto): Promise<AppointmentResponseDto> {
    try {
      const updateData: any = { ...data };
      if (data.datetime) {
        updateData.datetime = new Date(data.datetime);
      }

      await this.db.update(appointments).set(updateData).where(eq(appointments.id, id));
      return this.findUnique(id);
    } catch (error) {
      handleDatabaseError(error);
    }
  }

  async delete(id: number): Promise<ApiResponse> {
    try {
      await this.findUnique(id);
      await this.db.delete(appointments).where(eq(appointments.id, id));
      return { message: 'Appointment deleted successfully' };
    } catch (error) {
      handleDatabaseError(error);
    }
  }
}
