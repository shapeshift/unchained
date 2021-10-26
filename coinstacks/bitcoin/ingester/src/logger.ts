import { Logger } from '@shapeshiftoss/logger'

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'bitcoin', 'injester'],
  level: process.env.LOG_LEVEL,
})
