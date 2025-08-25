import { Logger } from '@shapeshiftoss/logger'
import WebSocket from 'ws'

const BASE_DELAY = 500
const MAX_DELAY = 120_000
const MAX_RETRY_ATTEMPTS = 0
const RESET_INTERVAL = 30_000

export interface Subscription {
  jsonrpc: '2.0'
  id: string
  method: string
  params?: unknown
}

export interface Args {
  apiKey?: string
  logger: Logger
}

export interface Options {
  pingInterval?: number
  retryAttempts?: number
  resetInterval?: number
}

export abstract class BaseWebsocketClient {
  protected socket?: WebSocket
  protected url: string
  protected pingTimeout?: NodeJS.Timeout
  protected interval?: NodeJS.Timeout
  protected resetTimeout?: NodeJS.Timeout
  protected retryCount = 0
  protected logger: Logger

  protected readonly pingInterval: number
  protected readonly retryAttempts: number
  protected readonly resetInterval: number

  protected abstract onOpen(): void
  protected abstract onMessage(message: WebSocket.MessageEvent): Promise<void>

  constructor(url: string, args: Args, opts?: Options) {
    this.url = url
    this.logger = args.logger

    this.pingInterval = opts?.pingInterval ?? 10000
    this.retryAttempts = opts?.retryAttempts ?? MAX_RETRY_ATTEMPTS
    this.resetInterval = opts?.resetInterval ?? RESET_INTERVAL
  }

  protected connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) return

    this.socket = new WebSocket(this.url, { handshakeTimeout: 5000 })

    this.socket.on('ping', () => this.socket?.pong())
    this.socket.on('pong', () => this.heartbeat())
    this.socket.onerror = (error) => {
      this.logger.error({ error, fn: 'ws.onerror' }, 'websocket error')
    }
    this.socket.onclose = ({ code, reason }) => {
      this.logger.error({ code, reason, fn: 'ws.close' }, 'websocket closed')
      this.close(code)
    }
    this.socket.onmessage = (msg) => this.onMessage(msg)
    this.socket.onopen = () => {
      this.logger.debug({ fn: 'ws.onopen' }, 'websocket opened')
      this.retryCount = 0
      this.interval = setInterval(() => this.socket?.ping(), this.pingInterval)
      this.heartbeat()
      this.onOpen()
      this.reset()
    }
  }

  private close(code: number): void {
    this.interval && clearInterval(this.interval)
    this.pingTimeout && clearTimeout(this.pingTimeout)
    this.resetTimeout && clearTimeout(this.resetTimeout)

    if (++this.retryCount >= this.retryAttempts && this.retryAttempts !== 0) {
      throw new Error('failed to reconnect')
    }

    if (code === 1000) return

    setTimeout(() => this.connect(), Math.min(Math.random() * (BASE_DELAY * this.retryCount ** 2), MAX_DELAY))
  }

  private heartbeat(): void {
    this.pingTimeout && clearTimeout(this.pingTimeout)
    this.pingTimeout = setTimeout(() => {
      this.logger.debug({ fn: 'pingTimeout' }, 'heartbeat failed')
      this.socket?.terminate()
    }, this.pingInterval + 1000)
  }

  protected reset(): void {
    if (this.resetInterval === 0) return

    this.resetTimeout && clearTimeout(this.resetTimeout)
    this.resetTimeout = setTimeout(() => {
      this.logger.debug({ fn: 'reset' }, 'reset websocket')
      this.socket?.terminate()
    }, this.resetInterval)
  }
}

export abstract class AddressSubscriptionWebsocketClient extends BaseWebsocketClient {
  abstract subscribeAddresses(addresses: string[]): void
}
