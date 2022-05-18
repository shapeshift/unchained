import WebSocket from 'ws'
import { Logger } from '@shapeshiftoss/logger'
import { Tx } from './models'
import { WebsocketRepsonse } from '.'

export interface Subscription {
  id: string
  jsonrpc: string
  method: string
  params?: Array<string>
}

export interface Options {
  pingInterval?: number
}

type OnMessageFunc = (data: Tx) => void

export class WebsocketClient {
  private socket: WebSocket
  private url: string
  private pingTimeout?: NodeJS.Timeout
  private onMessageFunc?: OnMessageFunc
  private retries = 0

  private readonly pingInterval: number
  private readonly retryAttempts = 5

  private logger = new Logger({ namespace: ['unchained', 'blockbook'], level: process.env.LOG_LEVEL })

  constructor(url: string, opts?: Options) {
    this.pingInterval = opts?.pingInterval ?? 10000
    this.url = url
    this.socket = new WebSocket(this.url, { handshakeTimeout: 5000 })

    this.new(true)
  }

  private new(init: boolean): void {
    if (!init) {
      if (++this.retries >= this.retryAttempts) {
        throw new Error('failed to reconnect')
      }

      this.socket = new WebSocket(this.url, { handshakeTimeout: 5000 })
    }

    const interval = setInterval(() => {
      this.socket.ping()
    }, this.pingInterval)

    this.socket.on('ping', () => this.socket.pong())
    this.socket.on('pong', () => this.heartbeat())
    this.socket.onerror = (error) => {
      // TODO: what kind of errors would we see and do we want to terminate and attempt reconnect?
      this.logger.error({ error, fn: 'ws.onerror' }, 'websocket error')
    }
    this.socket.onclose = ({ code, reason }) => {
      this.logger.error({ code, reason, fn: 'ws.close' }, 'websocket closed')
      this.close(interval)
    }
    this.socket.onmessage = async (message) => {
      try {
        const res: WebsocketRepsonse = JSON.parse(message.data.toString())

        if (!res.data) return
        if (!('txid' in res.data)) return

        this.onMessageFunc && this.onMessageFunc(res.data)
      } catch (err) {
        this.logger.error(err, 'failed to process transaction')
      }
    }
    this.socket.onopen = () => {
      this.logger.debug({ fn: 'ws.onopen' }, 'websocket opened')
      this.retries = 0
      this.heartbeat()

      const newTx: Subscription = {
        id: 'newTx',
        jsonrpc: '2.0',
        method: 'subscribeNewTransaction',
      }

      this.socket.send(JSON.stringify(newTx))
    }
  }

  private close(interval: NodeJS.Timeout): void {
    clearInterval(interval)
    // TODO: retry with backoff
    this.new(false)
  }

  private heartbeat(): void {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout)
    }

    this.pingTimeout = setTimeout(() => {
      this.logger.debug({ fn: 'pingTimeout' }, 'heartbeat failed')
      this.socket.terminate()
    }, this.pingInterval + 1000)
  }

  onMessage(func: OnMessageFunc): void {
    this.onMessageFunc = func
  }
}
