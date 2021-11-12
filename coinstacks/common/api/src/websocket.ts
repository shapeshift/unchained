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
  id: string
  blockNumber?: number
}

export interface ErrorResponse {
  type: 'error'
  message: string
}

export interface Methods {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe: (data: any) => Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unsubscribe?: (data: any) => Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update?: (data: any) => Promise<void>
}

export interface RequestPayload {
  method: 'subscribe' | 'unsubscribe' | 'update' | 'ping'
  data?: TxsTopicData
}

export class ConnectionHandler {
  public readonly id: string

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
    this.id = v4()
    this.isAlive = true
    this.rabbit = new Connection(BROKER_URI)
    this.unchainedExchange = this.rabbit.declareExchange('exchange.coinstack', '', { noCreate: true })
    this.routes = {
      txs: {
        subscribe: (data: TxsTopicData) => this.handleSubscribeTxs(data),
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
      this.logger.error({ id: this.id, event }, 'Websocket error')
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

  private sendError(message: string): void {
    this.websocket.send(JSON.stringify({ type: 'error', message } as ErrorResponse))
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
        case 'unsubscribe':
        case 'update': {
          const topic = payload.data?.topic

          if (!topic) {
            this.sendError(`no topic specified for method: ${payload.method}`)
            break
          }

          const callback = this.routes[topic][payload.method]
          if (callback) {
            await callback(payload.data)
          } else {
            this.sendError(`${payload.method} method not implemented for topic: ${topic}`)
          }
        }
      }
    } catch (err) {
      this.logger.error(err, { fn: 'onMessage', event }, 'Error processing message')
      this.sendError('failed to handle message')
    }
  }

  private async onClose(interval: NodeJS.Timeout) {
    for await (const [subscriptionId, queue] of Object.entries(this.queues)) {
      const msg: RegistryMessage = { action: 'unregister', client_id: `${this.id}-${subscriptionId}`, registration: {} }
      this.unchainedExchange.send(new Message(msg), 'registry')
      await queue.delete()
    }
    this.queues = {}
    clearInterval(interval)
  }

  private async handleSubscribeTxs(data: TxsTopicData) {
    const subscriptionId = `${this.id}-${data.id}`
    console.log('subscriptionId', subscriptionId)

    if (this.queues[subscriptionId]) return

    if (!data.addresses?.length) {
      this.sendError('addresses required')
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
      this.sendError('failed to complete RabbitMQ configuration')
      return
    }

    const ingesterMeta = data.addresses.reduce<Record<string, IngesterMetadata>>((prev, address) => {
      return { ...prev, [address]: { block: data.blockNumber } }
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
      const content = message.getContent()
      this.websocket.send(JSON.stringify({ id: data.id, data: content }), (err) => {
        if (err) {
          this.logger.error(
            err,
            { fn: 'onMessage', message, id: subscriptionId, content },
            'Error sending message to client'
          )
          message.nack(false, false)
          return
        }

        message.ack()
      })
    }

    queue.activateConsumer(onMessage)
  }
}
