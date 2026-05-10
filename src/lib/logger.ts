import pino from 'pino';
import { config } from '../config.js';

export const logger = pino(
  config.isDev
    ? {
        level: 'debug',
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
        },
      }
    : { level: 'info' },
);

export type Logger = typeof logger;
