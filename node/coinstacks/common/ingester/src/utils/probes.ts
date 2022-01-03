import { exec } from 'child_process'
import { logger } from './logger'

const moduleLogger = logger.child({ namespace: ['utils', 'probes'] })
export function ready(): void {
  const command = 'touch /tmp/ready'

  exec(command, () => {
    moduleLogger.info({ command, fn: 'ready' }, 'Probe ready')
  })
}

export function notReady(): void {
  const command = 'rm -rf /tmp/ready'

  exec(command, () => {
    moduleLogger.info({ command, fn: 'notReady' }, 'Probe not ready')
  })
}
