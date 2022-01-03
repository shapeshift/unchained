import { Logger } from '@shapeshiftoss/logger'

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'ethereum', 'ingester'],
  level: process.env.LOG_LEVEL,
})
