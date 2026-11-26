import { Logger } from '@shapeshiftoss/logger'

/**
 * Log uncaught exceptions and unhandled promise rejections before exiting.
 *
 * After an uncaught error the process state is unknown (half applied registry updates, leaked sockets, timers),
 * so the process still exits with a non zero code and relies on the platform restart policy, matching the
 * default node behavior. The difference is that the error is logged through the structured logger first.
 */
export const handleProcessErrors = (logger: Logger): void => {
  const processLogger = logger.child({ namespace: ['process'] })

  process.on('uncaughtException', (err, origin) => {
    processLogger.error(err, { fn: 'uncaughtException', origin }, 'Uncaught exception, exiting')
    process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    processLogger.error(reason, { fn: 'unhandledRejection' }, 'Unhandled promise rejection, exiting')
    process.exit(1)
  })
}
