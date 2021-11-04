import { Connection, Exchange, Message, Queue } from 'amqp-ts'
import { logger } from './utils/logger'
import { ready } from './utils/probes'

interface WorkerDeclaration {
  queueName?: string
  exchangeName?: string
  requeueName?: string
}

export class Worker {
  private connection: Connection
  private retryAttempts: Record<string, number> = {}
  private retryCount = 10
  private _logger = logger.child({ namespace: ['worker'] })

  public queue?: Queue
  public exchange?: Exchange
  public requeue?: Exchange

  constructor(connection: Connection, queue?: Queue, exchange?: Exchange, requeue?: Exchange) {
    this.connection = connection
    this.queue = queue
    this.exchange = exchange
    this.requeue = requeue
  }

  static async init({ queueName, exchangeName, requeueName }: WorkerDeclaration): Promise<Worker> {
    const NODE_ENV = process.env.NODE_ENV
    const BROKER_URL = process.env.BROKER_URL as string

    if (NODE_ENV !== 'test') {
      if (!BROKER_URL) throw new Error('BROKER_URL env var not set')
    }

    const connection = new Connection(BROKER_URL)
    const queue = queueName ? connection.declareQueue(queueName, { noCreate: true }) : undefined
    const requeue = requeueName ? connection.declareExchange(requeueName, '', { noCreate: true }) : undefined
    const exchange = exchangeName ? connection.declareExchange(exchangeName, '', { noCreate: true }) : undefined

    await connection.completeConfiguration()

    ready()

    return new Worker(connection, queue, exchange, requeue)
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Retry processing message with backoff.
   * Reject message and send to dead letter queue after exhausting retry attempts.
   *
   * **Only 1 ack or nack should occur per message (ackMessage, retryMessage, or requeueMessage)**
   */
  async retryMessage(message: Message, identifier: string): Promise<void> {
    const fnLogger = this._logger.child({
      identifier,
      message,
      fn: 'retryMessage',
      retryCount: this.retryCount,
      attempts: this.retryAttempts[identifier] ?? 1,
    })

    try {
      const attempts = this.retryAttempts[identifier] ?? 1

      if (attempts <= this.retryCount) {
        await this.sleep(attempts ** 2 * 100)
        fnLogger.debug('Retrying')
        message.nack(false, true)
        this.retryAttempts[identifier] = attempts + 1
      } else {
        fnLogger.error('Retry failed')
        message.reject()
        delete this.retryAttempts[identifier]
      }
    } catch (err) {
      fnLogger.error(err, 'Error retrying message')
    }
  }

  /**
   * Requeue message to the back of the queue.
   * The routing key is used to route the message to the correct queue and also determines routing to the correct dead letter queue if rejected.
   *
   * **Only 1 ack or nack should occur per message (ackMessage, retryMessage, or requeueMessage)**
   *
   * _If no requeue exchange is declared, message will be rejected._
   */
  requeueMessage(message: Message, identifier: string, routingKey?: string): void {
    const fnLogger = this._logger.child({ identifier, message, routingKey, fn: 'requeueMessage' })

    try {
      if (!this.requeue) {
        fnLogger.error('No requeue declared. Rejecting message.')
        message.reject()
        delete this.retryAttempts[identifier]
        return
      }

      const msg = message.getContent()
      message.ack() // ack message to remove from queue so we can requeue to back
      delete this.retryAttempts[identifier]
      fnLogger.debug('Requeuing message')
      this.requeue.send(new Message(msg), routingKey)
    } catch (err) {
      fnLogger.error(err, 'Error requeuing message')
    }
  }

  /**
   * Sends message to the declared exchange.
   * The routing key is used to route the message to the correct queue and also determines routing to the correct dead letter queue if rejected.
   */
  sendMessage(message: Message, routingKey?: string): void {
    if (!this.exchange) {
      this._logger.warn({ fn: 'sendMessage' }, 'No exchange declared')
      return
    }

    this.exchange.send(message, routingKey)
  }

  /**
   * Acknowledges message, removing from the queue as successfully processed.
   *
   * **Only 1 ack or nack should occur per message (ackMessage, retryMessage, or requeueMessage)**
   *
   * _Provide identifier if using Worker.retryMessage for message to clean up retryAttempts_
   */
  ackMessage(message: Message, identifier?: string): void {
    message.ack()
    identifier && delete this.retryAttempts[identifier]
  }

  async stop(): Promise<void> {
    this.connection.close()
  }
}
