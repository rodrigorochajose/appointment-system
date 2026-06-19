import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/mysql2';
import * as mysql from 'mysql2/promise';
import * as schema from './schemas';
import { getDbCredentials } from './db-credentials';

export const DATABASE_CONNECTION = 'DATABASE_CONNECTION';

const databaseProvider = {
  provide: DATABASE_CONNECTION,
  useFactory: () => {
    // Pool em vez de conexão única: provedores serverless (TiDB) fecham
    // conexões ociosas e o Render free hiberna — o pool reconecta sozinho,
    // descartando conexões mortas em vez de quebrar a próxima query.
    const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    const pool = mysql.createPool({
      ...getDbCredentials(env),
      connectionLimit: 5,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });

    return drizzle(pool, { schema, mode: 'default' });
  },
};

@Global()
@Module({
  providers: [databaseProvider],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
