import { Logger, transports } from 'winston'

export const logger = new Logger({
  transports: [
    new transports.Console({
      level: process.env.LOG_LEVEL ?? 'info',
      handleExceptions: true,
      colorize: false,
    }),
  ],
})
