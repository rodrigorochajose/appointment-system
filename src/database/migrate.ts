import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { log } from '../common/logger';
import { getDbCredentials, type DbEnv } from './db-credentials';

dotenv.config();

// O ambiente vem do comando: `db:migrate:prod` usa DATABASE_URL_PROD;
// `db:migrate:dev` (padrão) usa DATABASE_URL_DEV.
const env: DbEnv = process.argv[2] === 'prod' ? 'prod' : 'dev';

async function main() {
  log.info(`Running migrations against: ${env.toUpperCase()}`);

  const connection = await mysql.createConnection(getDbCredentials(env));

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
