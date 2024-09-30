import WebSocket from 'ws'
import { Logger } from '@shapeshiftoss/logger'

const BASE_DELAY = 500
const MAX_DELAY = 120_000
const MAX_RETRY_ATTEMPTS = 0

export interface Subscription {
  id: string
  method: string
  params?: unknown
}

export interface Args {
  apiKey?: string
  blockHandler: BlockHandler | Array<BlockHandler>
}

export interface Options {
  pingInterval?: number
  retryAttempts?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TransactionHandler = (data: any) => Promise<void>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BlockHandler = (data: any) => Promise<void>

export class SolanaWebsocketClient {
  private socket: WebSocket
  private url: string
  private pingTimeout?: NodeJS.Timeout
  private interval?: NodeJS.Timeout
  private retryCount = 0

  private handleBlock: BlockHandler | Array<BlockHandler>

  private readonly pingInterval: number
  private readonly retryAttempts: number

  private logger = new Logger({ namespace: ['unchained', 'solana', 'websocket'], level: process.env.LOG_LEVEL })

  constructor(url: string, args: Args, opts?: Options) {
    this.handleBlock = args.blockHandler
    this.url = args.apiKey ? `${url}/?api-key=${args.apiKey}` : url
    this.socket = new WebSocket(this.url, { handshakeTimeout: 5000 })

    this.pingInterval = opts?.pingInterval ?? 10000
    this.retryAttempts = opts?.retryAttempts ?? MAX_RETRY_ATTEMPTS

    this.initialize()
  }

  private initialize(): void {
    this.socket.on('ping', () => this.socket.pong())
    this.socket.on('pong', () => this.heartbeat())
    this.socket.onerror = (error) => {
      this.logger.error({ error, fn: 'ws.onerror' }, 'websocket error')
    }
    this.socket.onclose = ({ code, reason }) => {
      this.logger.error({ code, reason, fn: 'ws.close' }, 'websocket closed')
      this.close()
    }
    this.socket.onopen = () => this.onOpen()
    this.socket.onmessage = (msg) => this.onMessage(msg)
  }

  private close(): void {
    this.interval && clearInterval(this.interval)

    if (++this.retryCount >= this.retryAttempts && this.retryAttempts !== 0) {
      throw new Error('failed to reconnect')
    }

    setTimeout(
      () => {
        this.socket = new WebSocket(this.url, { handshakeTimeout: 5000 })
        this.initialize()
      },
      Math.min(Math.random() * (BASE_DELAY * this.retryCount ** 2), MAX_DELAY)
    )
  }

  private heartbeat(): void {
    this.pingTimeout && clearTimeout(this.pingTimeout)
    this.pingTimeout = setTimeout(() => {
      this.logger.debug({ fn: 'pingTimeout' }, 'heartbeat failed')
      this.socket.terminate()
    }, this.pingInterval + 1000)
  }

  private onOpen(): void {
    this.logger.debug({ fn: 'ws.onopen' }, 'websocket opened')
    this.retryCount = 0
    this.interval = setInterval(() => this.socket.ping(), this.pingInterval)
    this.heartbeat()

    const subscribeNewBlock: Subscription = { id: 'newBlock', method: 'blockSubscribe', params: {} }
    this.socket.send(JSON.stringify(subscribeNewBlock))
  }

  private async onMessage(message: WebSocket.MessageEvent): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = JSON.parse(message.data.toString())

      if (!res.data) return

      switch (res.id) {
        case 'newBlock':
          if ('hash' in res.data) {
            const newBlock = res.data

            if (Array.isArray(this.handleBlock)) {
              this.handleBlock.map(async (handleBlock) => handleBlock(newBlock))
            } else {
              this.handleBlock(newBlock)
            }
          }
          return
      }
    } catch (err) {
      this.logger.error(err, `failed to handle message: ${JSON.stringify(message)}`)
    }
  }
}
