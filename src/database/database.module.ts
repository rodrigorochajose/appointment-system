import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/mysql2';
import * as mysql from 'mysql2/promise';
import * as schema from './schemas';
import { getDbCredentials } from './db-credentials';

export const DATABASE_CONNECTION = 'DATABASE_CONNECTION';

const databaseProvider = {
  provide: DATABASE_CONNECTION,
  useFactory: async () => {
    const connection = await mysql.createConnection(getDbCredentials());

    return drizzle(connection, { schema, mode: 'default' });
  },
};

@Global()
@Module({
  providers: [databaseProvider],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
