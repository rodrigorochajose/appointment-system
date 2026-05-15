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
    datetime: datetime('datetime').notNull(),
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

export const usersRelations = relations(users, ({ many }) => ({
  appointments: many(appointments),
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
