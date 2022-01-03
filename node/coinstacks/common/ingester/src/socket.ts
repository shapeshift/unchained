import { Connection, Exchange } from 'amqp-ts'
import WebSocket from 'ws'
import { logger } from './utils/logger'
import { notReady } from './utils/probes'

export interface Subscription {
  id: string
  jsonrpc: string
  method: string
  params?: Array<string>
}

export class Socket {
  private socket: WebSocket

  public exchange: Exchange
  public pingpong?: 'ping' | 'pong'

  constructor(socket: WebSocket, exchange: Exchange, subscription: Subscription) {
    this.socket = socket
    this.exchange = exchange

    this.socket.onerror = (error: WebSocket.ErrorEvent) => {
      logger.error({ error, fn: 'onError' }, 'Websocket error')
      notReady()
    }

    this.socket.close = (code?: number, data?: string) => {
      logger.error({ code, data, fn: 'onError' }, 'Websocket closed')
      notReady()
    }

    this.socket.onopen = () => {
      logger.debug({ fn: 'onOpen' }, 'Websocket opened')
      this.keepAlive()
      this.socket.send(JSON.stringify(subscription))
    }
  }

  static async init(url: string, subscription: Subscription, exchangeName: string): Promise<Socket> {
    const NODE_ENV = process.env.NODE_ENV
    const BROKER_URI = process.env.BROKER_URI as string

    if (NODE_ENV !== 'test') {
      if (!BROKER_URI) throw new Error('BROKER_URI env var not set')
    }

    const connection = new Connection(BROKER_URI)
    const exchange = connection.declareExchange(exchangeName, '', { noCreate: true })

    await connection.completeConfiguration()

    const socket = new WebSocket(url, { handshakeTimeout: 5000 })

    return new Socket(socket, exchange, subscription)
  }

  private keepAlive() {
    // only ever allow a single ping loop
    if (this.pingpong !== undefined) return

    const ping = setInterval(() => {
      if (this.pingpong === 'ping') {
        // still waiting on response from previous ping
        // force reconnect (from kube liveness probe) by closing socket
        this.socket.close()
        clearInterval(ping)
      } else {
        // re ping
        this.socket.send(JSON.stringify({ id: 'ping', method: 'ping' }), () => {
          this.pingpong = 'ping'
        })
      }
    }, 1000)
  }

  onMessage(func: (message: WebSocket.MessageEvent) => void): void {
    this.socket.onmessage = func
  }
}
