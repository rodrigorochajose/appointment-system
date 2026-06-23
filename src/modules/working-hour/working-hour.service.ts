import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_CONNECTION } from 'src/database/database.module';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { and, eq } from 'drizzle-orm';
import { workingHours, WorkingHour } from 'src/database/schemas';
import { handleDatabaseError } from 'src/common/helpers/database-error-handler';

/** Faixa de trabalho (HH:MM:SS) usada ao configurar a jornada. */
export type WorkingHourWindow = { begin: string; end: string };

@Injectable()
export class WorkingHourService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: MySql2Database,
  ) {}

  /** Todas as faixas de uma agenda (todos os dias da semana). */
  async findManyBySchedule(scheduleId: number): Promise<WorkingHour[]> {
    return await this.db
      .select()
      .from(workingHours)
      .where(eq(workingHours.scheduleId, scheduleId));
  }

  /**
   * Substitui (delete + insert) as faixas de um dia da semana.
   * `windows` vazio deixa o dia sem expediente (fechado).
   */
  async replaceWeekday(
    scheduleId: number,
    weekday: number,
    windows: WorkingHourWindow[],
  ): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .delete(workingHours)
          .where(and(eq(workingHours.scheduleId, scheduleId), eq(workingHours.weekday, weekday)));

        if (windows.length > 0) {
          await tx.insert(workingHours).values(
            windows.map((w) => ({
              scheduleId,
              weekday,
              begin: w.begin,
              end: w.end,
            })),
          );
        }
      });
    } catch (error) {
      handleDatabaseError(error);
    }
  }
}
