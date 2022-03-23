import WebSocket from 'ws'
import { v4 } from 'uuid'
import { Logger } from '@shapeshiftoss/logger'
import { Registry } from './registry'

export interface RequestPayload {
  subscriptionId: string
  method: 'subscribe' | 'unsubscribe' | 'ping'
  data?: TxsTopicData
}

export interface ErrorResponse {
  subscriptionId: string
  type: 'error'
  message: string
}

export type Topics = 'txs'

export interface TxsTopicData {
  topic: 'txs'
  addresses: Array<string>
}

export interface Methods {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe: (subscriptionId: string, data?: any) => Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unsubscribe: (subscriptionId: string, data?: any) => void
}

export class ConnectionHandler {
  public readonly clientId: string

  private readonly websocket: WebSocket
  private readonly registry: Registry
  private readonly routes: Record<Topics, Methods>

  private isAlive: boolean
  private logger = new Logger({
    namespace: ['unchained', 'coinstacks', 'common', 'api'],
    level: process.env.LOG_LEVEL,
  })

  private constructor(websocket: WebSocket, registry: Registry) {
    this.clientId = v4()
    this.registry = registry
    this.isAlive = true
    this.routes = {
      txs: {
        subscribe: (subscriptionId: string, data?: TxsTopicData) => this.handleSubscribeTxs(subscriptionId, data),
        unsubscribe: (subscriptionId: string, data?: TxsTopicData) => this.handleUnsubscribeTxs(subscriptionId, data),
      },
    }

    const interval = setInterval(() => {
      if (!this.isAlive) return this.websocket.terminate()

      this.isAlive = false
      this.websocket.ping()
      this.websocket.send('ping') // browsers do not support ping/pong frame, send message instead
    }, 10000)

    this.websocket = websocket
    this.websocket.onmessage = (event) => this.onMessage(event)
    this.websocket.onerror = (event) => {
      this.logger.error({ clientId: this.clientId, event }, 'Websocket error')
      this.onClose(interval)
    }
    this.websocket.onclose = () => this.onClose(interval)
    this.websocket.on('pong', () => this.heartbeat())
    this.websocket.on('ping', () => this.websocket.pong())
  }

  static start(websocket: WebSocket, registry: Registry): void {
    new ConnectionHandler(websocket, registry)
  }

  private heartbeat(): void {
    this.isAlive = true
  }

  private sendError(message: string, subscriptionId: string): void {
    this.websocket.send(JSON.stringify({ subscriptionId, type: 'error', message } as ErrorResponse))
  }

  private async onMessage(event: WebSocket.MessageEvent): Promise<void> {
    try {
      console.log('event', event.data)
      const payload: RequestPayload = JSON.parse(event.data.toString())

      switch (payload.method) {
        // browsers do not support ping/pong frame, handle message instead
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
            await callback(payload.subscriptionId, payload.data)
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
    clearInterval(interval)
  }

  private async handleSubscribeTxs(subscriptionId: string, data?: TxsTopicData) {
    if (!data?.addresses?.length) {
      this.sendError('addresses required', subscriptionId)
      return
    }

    this.registry.subscribe(this.clientId, data.addresses)
  }

  private handleUnsubscribeTxs(subscriptionId: string, data?: TxsTopicData) {
    console.log(subscriptionId, data)
    //const queueId = `${this.clientId}-${subscriptionId}`
    // unregister address
  }
}
