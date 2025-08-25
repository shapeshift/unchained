import { Logger } from '@shapeshiftoss/logger'
import { Prometheus } from '@shapeshiftoss/prometheus'
import { v4 } from 'uuid'
import WebSocket from 'ws'

export interface RequestPayload {
  subscriptionId: string
  method: 'subscribe' | 'unsubscribe' | 'ping'
  data?: unknown
}

export interface ErrorResponse {
  subscriptionId: string
  type: 'error'
  message: string
}

export interface MessageResponse extends Record<string, unknown> {
  data: unknown
}

export abstract class BaseConnectionHandler {
  public readonly clientId: string

  protected readonly websocket: WebSocket
  private readonly prometheus?: Prometheus
  private readonly logger: Logger
  private readonly pingIntervalMs = 10000

  private pingTimeout?: NodeJS.Timeout
  protected subscriptionIds = new Set<string>()

  abstract onSubscribe(subscriptionId: string, data?: unknown): void
  abstract onUnsubscribe(subscriptionId: string, data?: unknown): void
  abstract onClose(): void

  constructor(websocket: WebSocket, prometheus: Prometheus, logger: Logger) {
    this.clientId = v4()
    this.prometheus = prometheus
    this.logger = logger.child({ namespace: ['websocket'] })

    this.pingTimeout = undefined
    this.prometheus?.metrics.websocketCount.inc()
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
      this.prometheus?.metrics.websocketCount.dec()
      this.logger.debug({ clientId: this.clientId, code, reason, fn: 'ws.close' }, 'websocket closed')
      this.close(pingInterval)
    }
    this.websocket.on('pong', () => this.heartbeat())
    this.websocket.on('ping', () => this.websocket.pong())
    this.websocket.onmessage = (event) => this.onMessage(event)
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

  protected sendError(message: string, subscriptionId: string): void {
    this.websocket.send(JSON.stringify({ subscriptionId, type: 'error', message } as ErrorResponse))
  }

  private onMessage(event: WebSocket.MessageEvent): void {
    try {
      const payload: RequestPayload = JSON.parse(event.data.toString())

      switch (payload.method) {
        // browsers do not support ping/pong frame, handle message instead
        case 'ping': {
          return this.websocket.send('pong')
        }
        case 'subscribe':
          return this.onSubscribe(payload.subscriptionId, payload.data)
        case 'unsubscribe':
          return this.onUnsubscribe(payload.subscriptionId, payload.data)
      }
    } catch (err) {
      this.logger.error(err, { clientId: this.clientId, fn: 'onMessage', event }, 'Error processing message')
    }
  }

  private close(interval: NodeJS.Timeout): void {
    this.pingTimeout && clearTimeout(this.pingTimeout)
    clearInterval(interval)
    this.onClose()
    this.subscriptionIds.clear()
  }

  publish(subscriptionId: string, payload: { data: unknown } & Record<string, unknown>): void {
    this.websocket.send(JSON.stringify({ ...payload, subscriptionId }))
  }
}
