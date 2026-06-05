import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { log } from '../common/logger';
import { getDbCredentials } from './db-credentials';

dotenv.config();

async function main() {
  const connection = await mysql.createConnection(getDbCredentials());

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
