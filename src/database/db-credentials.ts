import type { ConnectionOptions } from 'mysql2/promise';

/** Ambientes de banco suportados, cada um com sua própria connection string. */
export type DbEnv = 'dev' | 'prod';

/** Porta MySQL padrão, usada quando a URL não especifica uma. */
const DEFAULT_PORT = 3306;

type SslConfig = { minVersion: 'TLSv1.2'; rejectUnauthorized: true } | undefined;

/**
 * SSL é ativado quando a connection string contém sslaccept/sslmode/ssl
 * (TiDB Cloud e a maioria dos provedores cloud exigem). O dev local fica sem TLS.
 */
function resolveSsl(url: string): SslConfig {
  const enabled = /ssl(accept|mode)?=/i.test(url);
  return enabled ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined;
}

/** Variável de ambiente que guarda a connection string de cada ambiente. */
const URL_VAR: Record<DbEnv, string> = {
  dev: 'DATABASE_URL_DEV',
  prod: 'DATABASE_URL_PROD',
};

/**
 * Monta as credenciais de conexão MySQL para o ambiente informado, lendo a
 * connection string correspondente (`DATABASE_URL_DEV` ou `DATABASE_URL_PROD`).
 *
 * O ambiente é sempre explícito — quem chama (o script de migration ou o módulo
 * de banco) decide qual usar; aqui não há dependência de NODE_ENV.
 */
export function getDbCredentials(env: DbEnv): ConnectionOptions {
  const varName = URL_VAR[env];
  const url = process.env[varName];

  if (!url) {
    throw new Error(`${varName} não definida no .env — necessária para conectar ao ambiente "${env}".`);
  }

  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : DEFAULT_PORT,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    ssl: resolveSsl(url),
  };
}
