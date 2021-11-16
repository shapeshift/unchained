import WebSocket from 'ws'
import { v4 } from 'uuid'
import { Connection, Exchange, Message, Queue } from 'amqp-ts'
import { RegistryMessage } from '@shapeshiftoss/common-ingester'
import { IngesterMetadata } from '@shapeshiftoss/common-mongo'
import { Logger } from '@shapeshiftoss/logger'

const BROKER_URI = process.env.BROKER_URI as string

if (!BROKER_URI) throw new Error('BROKER_URI env var not set')

export type Topics = 'txs'

export interface TxsTopicData {
  topic: 'txs'
  addresses: Array<string>
}

export interface ErrorResponse {
  subscriptionId: string
  type: 'error'
  message: string
}

export interface Methods {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe: (data: any, subscriptionId: string) => Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unsubscribe: (data: any, subscriptionId: string) => void
}

export interface RequestPayload {
  subscriptionId: string
  method: 'subscribe' | 'unsubscribe' | 'ping'
  data?: TxsTopicData
}

export class ConnectionHandler {
  public readonly clientId: string

  private readonly rabbit: Connection
  private readonly websocket: WebSocket
  private readonly routes: Record<Topics, Methods>
  private readonly unchainedExchange: Exchange

  private isAlive: boolean
  private queues: Record<string, Queue> = {}
  private logger = new Logger({
    namespace: ['unchained', 'coinstacks', 'common', 'api'],
    level: process.env.LOG_LEVEL,
  })

  private constructor(websocket: WebSocket) {
    this.clientId = v4()
    this.isAlive = true
    this.rabbit = new Connection(BROKER_URI)
    this.unchainedExchange = this.rabbit.declareExchange('exchange.coinstack', '', { noCreate: true })
    this.routes = {
      txs: {
        subscribe: (data: TxsTopicData, subscriptionId: string) => this.handleSubscribeTxs(data, subscriptionId),
        unsubscribe: (data: TxsTopicData, subscriptionId: string) => this.handleUnsubscribeTxs(data, subscriptionId),
      },
    }

    const interval = setInterval(() => {
      if (!this.isAlive) return this.websocket.terminate()

      this.isAlive = false
      this.websocket.ping()
      this.websocket.send('ping')
    }, 10000)

    this.websocket = websocket
    this.websocket.onmessage = (event) => this.onMessage(event)
    this.websocket.onerror = (event) => {
      this.logger.error({ clientId: this.clientId, event }, 'Websocket error')
      this.onClose(interval)
    }
    this.websocket.onclose = () => this.onClose(interval)
    this.websocket.on('pong', () => this.heartbeat())
  }

  static start(websocket: WebSocket): void {
    new ConnectionHandler(websocket)
  }

  private heartbeat(): void {
    this.isAlive = true
  }

  private sendError(message: string, subscriptionId: string): void {
    this.websocket.send(JSON.stringify({ subscriptionId, type: 'error', message } as ErrorResponse))
  }

  private async onMessage(event: WebSocket.MessageEvent): Promise<void> {
    try {
      const payload: RequestPayload = JSON.parse(event.data.toString())

      switch (payload.method) {
        case 'ping': {
          this.websocket.send('pong')
          break
        }
        case 'subscribe':
        case 'unsubscribe': {
          const topic = payload.data?.topic

          if (!topic) {
            this.sendError(`no topic specified for method: ${payload.method}`, payload.subscriptionId)
            break
          }

          const callback = this.routes[topic][payload.method]
          if (callback) {
            await callback(payload.data, payload.subscriptionId)
          } else {
            this.sendError(`${payload.method} method not implemented for topic: ${topic}`, payload.subscriptionId)
          }
        }
      }
    } catch (err) {
      this.logger.error(err, { fn: 'onMessage', event }, 'Error processing message')
    }
  }

  private async onClose(interval: NodeJS.Timeout) {
    for await (const [queueId, queue] of Object.entries(this.queues)) {
      const msg: RegistryMessage = { action: 'unregister', client_id: queueId, registration: {} }
      this.unchainedExchange.send(new Message(msg), 'registry')
      await queue.delete()
    }
    this.queues = {}
    clearInterval(interval)
  }

  private async handleSubscribeTxs(data: TxsTopicData, subscriptionId: string) {
    const queueId = `${this.clientId}-${subscriptionId}`

    if (this.queues[queueId]) return

    if (!data.addresses?.length) {
      this.sendError('addresses required', subscriptionId)
      return
    }

    const txExchange = this.rabbit.declareExchange('exchange.tx.client', '', { noCreate: true })

    const queue = this.rabbit.declareQueue(`queue.tx.${queueId}`)
    queue.bind(txExchange, queueId)

    try {
      await this.rabbit.completeConfiguration()
      this.queues[queueId] = queue
    } catch (err) {
      this.logger.error(err, { fn: 'handleSubscribeTxs', data }, 'Failed to complete RabbitMQ configuration')
      return
    }

    const ingesterMeta = data.addresses.reduce<Record<string, IngesterMetadata>>((prev, address) => {
      return { ...prev, [address]: { block: 0 } }
    }, {})

    const msg: RegistryMessage = {
      action: 'register',
      client_id: queueId,
      ingester_meta: ingesterMeta,
      registration: {
        addresses: data.addresses,
      },
    }

    this.unchainedExchange.send(new Message(msg), 'registry')

    const onMessage = (message: Message) => {
      try {
        const content = message.getContent()
        this.websocket.send(JSON.stringify({ subscriptionId, data: content }), (err) => {
          if (err) {
            this.logger.error(
              err,
              { fn: 'onMessage', message, subscriptionId, content },
              'Error sending message to client'
            )
            message.nack(false, false)
            return
          }

          message.ack()
        })
      } catch (err) {
        this.logger.error(err, { fn: 'onMessage', message, subscriptionId }, 'Error processing message')
        message.nack(false, false)
      }
    }

    queue.activateConsumer(onMessage)
  }

  private handleUnsubscribeTxs(data: TxsTopicData, subscriptionId: string) {
    const queueId = `${this.clientId}-${subscriptionId}`

    if (!this.queues[queueId]) return

    const msg: RegistryMessage = {
      action: 'unregister',
      client_id: queueId,
      ingester_meta: {},
      registration: {
        addresses: data.addresses,
      },
    }

    this.unchainedExchange.send(new Message(msg), 'registry')
    this.queues[queueId].delete()
  }
}
