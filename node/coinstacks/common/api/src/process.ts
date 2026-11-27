import { Logger } from '@shapeshiftoss/logger'

// upper bound on how long to wait for stdout/stderr to flush before exiting anyway
const EXIT_FLUSH_TIMEOUT_MS = 1000

/**
 * Exit once stdout and stderr have flushed any pending writes (the default logger writes through console),
 * or after a short timeout if they do not drain.
 */
export const flushAndExit = (
  code: number,
  streams: Array<NodeJS.WritableStream> = [process.stdout, process.stderr]
) => {
  let exited = false
  const exit = () => {
    if (exited) return
    exited = true
    process.exit(code)
  }

  setTimeout(exit, EXIT_FLUSH_TIMEOUT_MS)

  let pending = streams.length
  const done = () => --pending <= 0 && exit()

  if (!pending) return exit()

  for (const stream of streams) {
    try {
      // the callback runs after all previously queued writes on the stream have been flushed (or on error)
      stream.write('', done)
    } catch (err) {
      done()
    }
  }
}

/**
 * Log uncaught exceptions and unhandled promise rejections before exiting.
 *
 * After an uncaught error the process state is unknown (half applied registry updates, leaked sockets, timers),
 * so the process still exits with a non zero code and relies on the platform restart policy, matching the
 * default node behavior. The difference is that the error is logged through the structured logger first.
 */
export const handleProcessErrors = (logger: Logger): void => {
  const processLogger = logger.child({ namespace: ['process'] })

  let exiting = false
  const fatal = () => {
    if (exiting) return
    exiting = true
    flushAndExit(1)
  }

  process.on('uncaughtException', (err, origin) => {
    processLogger.error(err, { fn: 'uncaughtException', origin }, 'Uncaught exception, exiting')
    fatal()
  })

  process.on('unhandledRejection', (reason) => {
    processLogger.error(reason, { fn: 'unhandledRejection' }, 'Unhandled promise rejection, exiting')
    fatal()
  })
}
