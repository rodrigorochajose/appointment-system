import * as dotenv from 'dotenv';
import pino from 'pino';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:dd/mm/yyyy HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: false,
          hideObject: false,
        },
      },
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: isProduction
    ? {
        pid: process.pid,
        hostname: process.env.HOSTNAME ?? 'unknown',
        service: 'appointment-system',
      }
    : undefined,
});

export const log = {
  debug: (message: string, data?: Record<string, unknown>) => logger.debug(data ?? {}, message),
  info: (message: string, data?: Record<string, unknown>) => logger.info(data ?? {}, message),
  warn: (message: string, data?: Record<string, unknown>) => logger.warn(data ?? {}, message),
  error: (message: string, error?: Error | Record<string, unknown>) => {
    if (error instanceof Error) {
      logger.error(
        {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        },
        message,
      );
    } else {
      logger.error((error as Record<string, unknown>) ?? {}, message);
    }
  },
  fatal: (message: string, error?: Error | Record<string, unknown>) => {
    if (error instanceof Error) {
      logger.fatal(
        {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        },
        message,
      );
    } else {
      logger.fatal((error as Record<string, unknown>) ?? {}, message);
    }
  },
};
