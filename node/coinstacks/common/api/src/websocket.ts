import WebSocket from 'ws'
import { v4 } from 'uuid'
import { Logger } from '@shapeshiftoss/logger'
import { Registry } from './registry'
import { Prometheus } from './prometheus'

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

export interface MessageResponse {
  address: string
  data: unknown
  subscriptionId: string
}

export interface Methods {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe: (subscriptionId: string, data?: any) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unsubscribe: (subscriptionId: string, data?: any) => void
}

export class ConnectionHandler {
  public readonly clientId: string

  private readonly websocket: WebSocket
  private readonly registry: Registry
  private readonly prometheus: Prometheus
  private readonly logger: Logger
  private readonly routes: Record<Topics, Methods>
  private readonly pingIntervalMs = 10000

  private pingTimeout?: NodeJS.Timeout
  private subscriptionIds = new Map<string, void>()

  private constructor(websocket: WebSocket, registry: Registry, prometheus: Prometheus, logger: Logger) {
    this.clientId = v4()
    this.registry = registry
    this.prometheus = prometheus
    this.logger = logger.child({ namespace: ['websocket'] })
    this.routes = {
      txs: {
        subscribe: (subscriptionId: string, data?: TxsTopicData) => this.handleSubscribeTxs(subscriptionId, data),
        unsubscribe: (subscriptionId: string, data?: TxsTopicData) => this.handleUnsubscribeTxs(subscriptionId, data),
      },
    }

    this.pingTimeout = undefined
    this.prometheus.metrics.websocketCount.inc()
    this.websocket = websocket
    this.websocket.ping()

    const pingInterval = setInterval(() => {
      this.websocket.ping()
    }, this.pingIntervalMs)

    this.websocket.onerror = (error) => {
      this.logger.error({ clientId: this.clientId, error, fn: 'ws.onerror' }, 'websocket error')
      this.close(pingInterval)
    }
    this.websocket.onclose = ({ code, reason }) => {
      this.prometheus.metrics.websocketCount.dec()
      this.logger.debug({ clientId: this.clientId, code, reason, fn: 'ws.close' }, 'websocket closed')
      this.close(pingInterval)
    }
    this.websocket.on('pong', () => this.heartbeat())
    this.websocket.on('ping', () => this.websocket.pong())
    this.websocket.onmessage = (event) => this.onMessage(event)
  }

  static start(websocket: WebSocket, registry: Registry, prometheus: Prometheus, logger: Logger): void {
    new ConnectionHandler(websocket, registry, prometheus, logger)
  }

  private heartbeat(): void {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout)
    }

    this.pingTimeout = setTimeout(() => {
      this.logger.debug({ clientId: this.clientId, fn: 'pingTimeout' }, 'heartbeat failed')
      this.websocket.terminate()
    }, this.pingIntervalMs + 1000)
  }

  private sendError(message: string, subscriptionId: string): void {
    this.websocket.send(JSON.stringify({ subscriptionId, type: 'error', message } as ErrorResponse))
  }

  private onMessage(event: WebSocket.MessageEvent): void {
    try {
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
            callback(payload.subscriptionId, payload.data)
          } else {
            this.sendError(`${payload.method} method not implemented for topic: ${topic}`, payload.subscriptionId)
          }
        }
      }
    } catch (err) {
      this.logger.error(err, { clientId: this.clientId, fn: 'onMessage', event }, 'Error processing message')
    }
  }

  private close(interval: NodeJS.Timeout): void {
    this.pingTimeout && clearTimeout(this.pingTimeout)
    clearInterval(interval)

    for (const subscriptionId of this.subscriptionIds.keys()) {
      this.registry.unsubscribe(this.clientId, subscriptionId, [])
    }

    this.subscriptionIds.clear()
  }

  private handleSubscribeTxs(subscriptionId: string, data?: TxsTopicData): void {
    if (!data?.addresses?.length) {
      this.sendError('addresses required', subscriptionId)
      return
    }

    this.subscriptionIds.set(subscriptionId)
    this.registry.subscribe(this.clientId, subscriptionId, this, data.addresses)
  }

  private handleUnsubscribeTxs(subscriptionId: string, data?: TxsTopicData): void {
    this.subscriptionIds.delete(subscriptionId)
    this.registry.unsubscribe(this.clientId, subscriptionId, data?.addresses ?? [])
  }

  publish(subscriptionId: string, address: string, data: unknown): void {
    const message: MessageResponse = { address, data, subscriptionId }
    this.websocket.send(JSON.stringify(message))
  }
}
