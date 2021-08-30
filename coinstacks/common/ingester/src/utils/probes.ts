import { exec } from 'child_process'
import { logger } from '@shapeshiftoss/logger'

export function ready(): void {
  const command = 'touch /tmp/ready'

  exec(command, () => {
    logger.info('ready:', command)
  })
}

export function notReady(): void {
  const command = 'rm -rf /tmp/ready'

  exec(command, () => {
    logger.info('notReady:', command)
  })
}
