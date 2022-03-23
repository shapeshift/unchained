import WebSocket from 'ws'
import { Logger } from '@shapeshiftoss/logger'

export interface Subscription {
  id: string
  jsonrpc: string
  method: string
  params?: Array<string>
}

export interface Options {
  pingInterval?: number
}

type OnMessageFunc = (message: WebSocket.MessageEvent) => void

export class WebsocketClient {
  private socket: WebSocket
  private pingTimeout?: NodeJS.Timeout
  private onMessageFunc?: OnMessageFunc

  private readonly pingInterval: number

  private logger = new Logger({
    namespace: ['unchained', 'coinstacks', 'common', 'api'],
    level: process.env.LOG_LEVEL,
  })

  constructor(url: string, opts?: Options) {
    this.pingInterval = opts?.pingInterval ?? 10000

    this.socket = new WebSocket(url, { handshakeTimeout: 5000 })

    this.socket.onerror = (error: WebSocket.ErrorEvent) => {
      this.logger.error({ error, fn: 'ws.onerror' }, 'websocket error')
    }

    this.socket.close = (code?: number, data?: string) => {
      this.logger.error({ code, data, fn: 'ws.close' }, 'websocket closed')
    }

    setInterval(() => {
      this.socket.ping()
    }, this.pingInterval)

    this.socket.on('pong', () => {
      this.heartbeat()
    })

    this.socket.onopen = () => {
      this.logger.debug({ fn: 'ws.onopen' }, 'websocket opened')
      this.heartbeat()
      this.start()
    }
  }

  private heartbeat(): void {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout)
    }

    this.pingTimeout = setTimeout(() => {
      this.logger.debug({ fn: 'pingTimeout' }, 'heartbeat failed')
      this.socket.terminate()
      // reconnect
    }, this.pingInterval + 1000)
  }

  private start(): void {
    const newTx: Subscription = {
      id: 'newTx',
      jsonrpc: '2.0',
      method: 'subscribeNewTransaction',
    }
    this.socket.send(JSON.stringify(newTx))
  }

  onMessage(func: OnMessageFunc): void {
    this.onMessageFunc = func
    this.socket.onmessage = this.onMessageFunc
  }
}
