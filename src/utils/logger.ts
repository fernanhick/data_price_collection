import pino from 'pino';
import config from '../config/index.js';

// Configure pino logger
// Handle both default and named exports
const pinoInstance = (pino as any).default || pino;

const logger = pinoInstance({
  level: config.logging.level,
  transport:
    config.nodeEnv === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

export default logger;
