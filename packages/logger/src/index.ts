import { Logger, transports } from 'winston'

export const logger = new Logger({
  transports: [
    new transports.Console({
      level: process.env.LOG_LEVEL ?? 'info',
      handleExceptions: true,
      json: process.env.NODE_ENV === 'stage' || process.env.NODE_ENV === 'prod',
      colorize: false,
    }),
  ],
})
