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
  id: string
  type: 'error'
  message: string
}

export interface Methods {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe: (data: any, id: string) => Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unsubscribe: (data: any, id: string) => void
}

export interface RequestPayload {
  id: string
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
        subscribe: (data: TxsTopicData, id: string) => this.handleSubscribeTxs(data, id),
        unsubscribe: (data: TxsTopicData, id: string) => this.handleUnsubscribeTxs(data, id),
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
      this.logger.error({ id: this.clientId, event }, 'Websocket error')
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

  private sendError(message: string, id: string): void {
    this.websocket.send(JSON.stringify({ id, type: 'error', message } as ErrorResponse))
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
            this.sendError(`no topic specified for method: ${payload.method}`, payload.id)
            break
          }

          const callback = this.routes[topic][payload.method]
          if (callback) {
            await callback(payload.data, payload.id)
          } else {
            this.sendError(`${payload.method} method not implemented for topic: ${topic}`, payload.id)
          }
        }
      }
    } catch (err) {
      this.logger.error(err, { fn: 'onMessage', event }, 'Error processing message')
    }
  }

  private async onClose(interval: NodeJS.Timeout) {
    for await (const [subscriptionId, queue] of Object.entries(this.queues)) {
      const msg: RegistryMessage = { action: 'unregister', client_id: subscriptionId, registration: {} }
      this.unchainedExchange.send(new Message(msg), 'registry')
      await queue.delete()
    }
    this.queues = {}
    clearInterval(interval)
  }

  private async handleSubscribeTxs(data: TxsTopicData, id: string) {
    const subscriptionId = `${this.clientId}-${id}`

    if (this.queues[subscriptionId]) return

    if (!data.addresses?.length) {
      this.sendError('addresses required', id)
      return
    }

    const txExchange = this.rabbit.declareExchange('exchange.tx.client', '', { noCreate: true })

    const queue = this.rabbit.declareQueue(`queue.tx.${subscriptionId}`)
    queue.bind(txExchange, subscriptionId)

    try {
      await this.rabbit.completeConfiguration()
      this.queues[subscriptionId] = queue
    } catch (err) {
      this.logger.error(err, { fn: 'handleSubscribeTxs', data }, 'Failed to complete RabbitMQ configuration')
      return
    }

    const ingesterMeta = data.addresses.reduce<Record<string, IngesterMetadata>>((prev, address) => {
      return { ...prev, [address]: { block: 0 } }
    }, {})

    const msg: RegistryMessage = {
      action: 'register',
      client_id: subscriptionId,
      ingester_meta: ingesterMeta,
      registration: {
        addresses: data.addresses,
      },
    }

    this.unchainedExchange.send(new Message(msg), 'registry')

    const onMessage = (message: Message) => {
      try {
        const content = message.getContent()
        this.websocket.send(JSON.stringify({ id, data: content }), (err) => {
          if (err) {
            this.logger.error(err, { fn: 'onMessage', message, id, content }, 'Error sending message to client')
            message.nack(false, false)
            return
          }

          message.ack()
        })
      } catch (err) {
        this.logger.error(err, { fn: 'onMessage', message, id }, 'Error processing message')
        message.nack(false, false)
      }
    }

    queue.activateConsumer(onMessage)
  }

  private handleUnsubscribeTxs(data: TxsTopicData, id: string) {
    if (!this.queues[id]) return

    const msg: RegistryMessage = {
      action: 'unregister',
      client_id: id,
      ingester_meta: {},
      registration: {
        addresses: data.addresses,
      },
    }

    this.unchainedExchange.send(new Message(msg), 'registry')
    this.queues[id].delete()
  }
}
