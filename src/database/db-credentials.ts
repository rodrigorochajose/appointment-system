import type { ConnectionOptions } from 'mysql2/promise';

/**
 * Monta as credenciais de conexão MySQL a partir do ambiente.
 *
 * Aceita duas formas:
 *  - DATABASE_URL (ex.: mysql://user:pass@host:4000/dbname) — usado por provedores
 *    cloud como TiDB Cloud, Aiven, Railway etc.
 *  - Variáveis discretas: DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
 *
 * SSL é ativado automaticamente quando DB_SSL=true (obrigatório no TiDB Cloud)
 * ou quando a URL contém sslaccept/ssl.
 */
export function getDbCredentials(): ConnectionOptions {
  const url = process.env.DATABASE_URL;
  const sslEnabled =
    process.env.DB_SSL === 'true' ||
    (!!url && /ssl(accept|mode)?=/i.test(url));

  const ssl = sslEnabled
    ? { minVersion: 'TLSv1.2' as const, rejectUnauthorized: true }
    : undefined;

  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ''),
      ssl,
    };
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'appointment',
    password: process.env.DB_PASSWORD || 'appoint123',
    database: process.env.DB_NAME || 'appointmentdb',
    ssl,
  };
}
