import { Logger } from '@shapeshiftoss/logger'

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'esmosis', 'api'],
  level: process.env.LOG_LEVEL,
})
