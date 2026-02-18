import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { log } from '../common/logger';

dotenv.config();

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'appointment',
    password: process.env.DB_PASSWORD || 'appoint123',
    database: process.env.DB_NAME || 'appointmentdb',
  });

  const db = drizzle(connection);

  log.info('Running migrations...');

  await migrate(db, { migrationsFolder: './src/database/migrations' });

  log.info('Migrations completed!');

  await connection.end();
}

main().catch((err) => {
  log.error('Migration failed!', err instanceof Error ? err : { err });
  process.exit(1);
});
