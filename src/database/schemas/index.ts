import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  decimal,
  datetime,
  boolean,
  unique,
  longtext,
  time,
} from 'drizzle-orm/mysql-core';
import { sql, relations } from 'drizzle-orm';

// ============================================
// SCHEMA: USER (Clientes)
// ============================================

export const users = mysqlTable('user', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 20 }).notNull().unique(),
  /**
   * Vínculo opcional com um profissional. Quando preenchido, esta identidade
   * (telefone) é um barbeiro e fala com o sistema pelo menu do worker.
   */
  workerId: int('worker_id').references(() => workers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ============================================
// SCHEMA: WORKER (Profissionais)
// ============================================

export const workers = mysqlTable('worker', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export type Worker = typeof workers.$inferSelect;
export type NewWorker = typeof workers.$inferInsert;

// ============================================
// SCHEMA: SCHEDULE (Agendas)
// ============================================

export const schedules = mysqlTable('schedule', {
  id: int('id').primaryKey().autoincrement(),
  workerId: int('worker_id')
    .notNull()
    .unique()
    .references(() => workers.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;

// ============================================
// SCHEMA: OFFERING (Serviços)
// ============================================

export const offerings = mysqlTable('offering', {
  id: int('id').primaryKey().autoincrement(),
  description: varchar('description', { length: 255 }).notNull(),
  value: decimal('value', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export type Offering = typeof offerings.$inferSelect;
export type NewOffering = typeof offerings.$inferInsert;

// ============================================
// SCHEMA: UNAVAILABLE PERIOD (Períodos Indisponíveis)
// ============================================

export const unavailablePeriods = mysqlTable('unavailable_period', {
  id: int('id').primaryKey().autoincrement(),
  scheduleId: int('schedule_id').references(() => schedules.id, {
    onDelete: 'cascade',
  }),
  date: datetime('date').notNull(),
  allDay: boolean('all_day').notNull(),
  begin: datetime('begin').notNull(),
  end: datetime('end').notNull(),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export type UnavailablePeriod = typeof unavailablePeriods.$inferSelect;
export type NewUnavailablePeriod = typeof unavailablePeriods.$inferInsert;

// ============================================
// SCHEMA: APPOINTMENT (Agendamentos)
// ============================================

export const appointments = mysqlTable(
  'appointment',
  {
    id: int('id').primaryKey().autoincrement(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workerId: int('worker_id').references(() => workers.id, {
      onDelete: 'cascade',
    }),
    offeringId: int('offering_id')
      .notNull()
      .references(() => offerings.id, { onDelete: 'restrict' }),
    fixed: boolean('fixed').notNull(),
    /** @deprecated Substituída por `fixedSeriesId`. Mantida só para não dropar dados legados. */
    seriesId: varchar('series_id', { length: 255 }),
    /**
     * Vínculo com a "fixação" (cliente recorrente semanal) quando esta linha é a
     * MATERIALIZAÇÃO de uma ocorrência específica — ex.: uma semana que foi
     * remarcada/desviada da regra. As ocorrências não-desviadas NÃO viram linha:
     * são projetadas virtualmente a partir de `fixed_series`. Null em avulsos.
     */
    fixedSeriesId: int('fixed_series_id').references(() => fixedSeries.id, {
      onDelete: 'set null',
    }),
    datetime: datetime('datetime').notNull(),
    googleEventId: varchar('google_event_id', { length: 255 }),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workerDatetimeIdx: unique('worker_datetime_idx').on(table.workerId, table.datetime),
  }),
);

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;

// ============================================
// SCHEMA: FIXED SERIES (Clientes fixos / recorrência semanal)
// ============================================

/**
 * A REGRA de uma fixação semanal. Uma linha por cliente fixo. As ocorrências
 * não são materializadas: são projetadas em tempo de leitura a partir daqui
 * (dia da semana + horário, de `startDate` em diante). Assim não há cron para
 * "estender" a série nem janela rolante — a projeção cobre qualquer intervalo.
 */
export const fixedSeries = mysqlTable('fixed_series', {
  id: int('id').primaryKey().autoincrement(),
  workerId: int('worker_id')
    .notNull()
    .references(() => workers.id, { onDelete: 'cascade' }),
  userId: int('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  offeringId: int('offering_id')
    .notNull()
    .references(() => offerings.id, { onDelete: 'restrict' }),
  /** Dia da semana (0=domingo … 6=sábado), no fuso America/Sao_Paulo. */
  weekday: int('weekday').notNull(),
  /** Horário de início no formato "HH:mm". */
  time: varchar('time', { length: 5 }).notNull(),
  /** Data (00:00 -03:00) da primeira ocorrência; projeção não vai antes disto. */
  startDate: datetime('start_date').notNull(),
  /** Série ativa; ao "desfixar", vira false e deixa de ser projetada. */
  active: boolean('active').notNull().default(true),
  /** Evento recorrente (RRULE WEEKLY) espelhado no Google Calendar, se houver. */
  googleEventId: varchar('google_event_id', { length: 255 }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export type FixedSeries = typeof fixedSeries.$inferSelect;
export type NewFixedSeries = typeof fixedSeries.$inferInsert;

/**
 * Exceção de uma série: uma data cuja ocorrência NÃO deve ser projetada porque
 * foi cancelada ou remarcada naquela semana. Presença de (série, data) = "pule
 * esta ocorrência". Remarcação também cria uma linha real em `appointment`.
 */
export const fixedSeriesExceptions = mysqlTable(
  'fixed_series_exception',
  {
    id: int('id').primaryKey().autoincrement(),
    seriesId: int('series_id')
      .notNull()
      .references(() => fixedSeries.id, { onDelete: 'cascade' }),
    /** Data (00:00 -03:00) da ocorrência pulada. */
    date: datetime('date').notNull(),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    seriesDateIdx: unique('series_date_idx').on(table.seriesId, table.date),
  }),
);

export type FixedSeriesException = typeof fixedSeriesExceptions.$inferSelect;
export type NewFixedSeriesException = typeof fixedSeriesExceptions.$inferInsert;

// ============================================
// SCHEMA: WORKING HOURS (Jornada de Trabalho)
// ============================================

export const workingHours = mysqlTable('working_hours', {
  id: int('id').primaryKey().autoincrement(),
  scheduleId: int('schedule_id')
    .notNull()
    .references(() => schedules.id, { onDelete: 'cascade' }),
  weekday: int('weekday').notNull(),
  begin: time('begin').notNull(),
  end: time('end').notNull(),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export type WorkingHour = typeof workingHours.$inferSelect;
export type NewWorkingHour = typeof workingHours.$inferInsert;

export const googleAccounts = mysqlTable('google_account', {
  id: int('id').primaryKey().autoincrement(),
  workerId: int('worker_id')
    .notNull()
    .unique()
    .references(() => workers.id, { onDelete: 'cascade' }),
  googleCalendarId: varchar('google_calendar_id', { length: 255 }).notNull(),
  googleEmail: varchar('google_email', { length: 255 }).notNull().unique(),
  googleRefreshToken: longtext('google_refresh_token').notNull(),
  /** Token de sincronização incremental do Google Calendar (events.list). */
  syncToken: longtext('sync_token'),
  /** Canal de push notifications (events.watch): id gerado por nós. */
  watchChannelId: varchar('watch_channel_id', { length: 255 }),
  /** resourceId retornado pelo Google (necessário para parar/renovar o canal). */
  watchResourceId: varchar('watch_resource_id', { length: 255 }),
  /** Quando o canal de push expira (renovamos antes disso). */
  watchExpiration: datetime('watch_expiration'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export type GoogleAccount = typeof googleAccounts.$inferSelect;
export type NewGoogleAccount = typeof googleAccounts.$inferInsert;

// ============================================
// RELAÇÕES (Relations)
// ============================================

export const usersRelations = relations(users, ({ one, many }) => ({
  appointments: many(appointments),
  worker: one(workers, {
    fields: [users.workerId],
    references: [workers.id],
  }),
}));

export const workersRelations = relations(workers, ({ one }) => ({
  schedule: one(schedules, {
    fields: [workers.id],
    references: [schedules.workerId],
  }),
  googleAccount: one(googleAccounts, {
    fields: [workers.id],
    references: [googleAccounts.workerId],
  }),
}));

export const googleAccountsRelations = relations(googleAccounts, ({ one }) => ({
  worker: one(workers, {
    fields: [googleAccounts.workerId],
    references: [workers.id],
  }),
}));

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  worker: one(workers, {
    fields: [schedules.workerId],
    references: [workers.id],
  }),
  appointments: many(appointments),
  unavailablePeriods: many(unavailablePeriods),
  workingHours: many(workingHours),
}));

export const workingHoursRelations = relations(workingHours, ({ one }) => ({
  schedule: one(schedules, {
    fields: [workingHours.scheduleId],
    references: [schedules.id],
  }),
}));

export const offeringsRelations = relations(offerings, ({ many }) => ({
  appointments: many(appointments),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  user: one(users, {
    fields: [appointments.userId],
    references: [users.id],
  }),
  schedule: one(workers, {
    fields: [appointments.workerId],
    references: [workers.id],
  }),
  offering: one(offerings, {
    fields: [appointments.offeringId],
    references: [offerings.id],
  }),
}));

export const unavailablePeriodsRelations = relations(unavailablePeriods, ({ one }) => ({
  schedule: one(schedules, {
    fields: [unavailablePeriods.scheduleId],
    references: [schedules.id],
  }),
}));
