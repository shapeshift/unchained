import WebSocket from 'ws'
import { Logger } from '@shapeshiftoss/logger'
import { Tx } from './models'
import { NewBlock, WebsocketRepsonse } from '.'

export interface Subscription {
  id: string
  method: string
  params?: unknown
}

export interface Args {
  apiKey?: string
  transactionHandler: TransactionHandler
  blockHandler: BlockHandler | Array<BlockHandler>
}

export interface Options {
  pingInterval?: number
}

type TransactionHandler = (data: Tx) => Promise<void>
type BlockHandler = (data: NewBlock) => Promise<void>

export class WebsocketClient {
  private socket: WebSocket
  private url: string
  private pingTimeout?: NodeJS.Timeout
  private interval?: NodeJS.Timeout
  private retryCount = 0

  private handleTransaction: TransactionHandler | Array<TransactionHandler>
  private handleBlock: BlockHandler | Array<BlockHandler>

  private readonly pingInterval: number
  private readonly retryAttempts = 5

  private logger = new Logger({ namespace: ['unchained', 'blockbook'], level: process.env.LOG_LEVEL })

  constructor(url: string, args: Args, opts?: Options) {
    this.handleTransaction = args.transactionHandler
    this.handleBlock = args.blockHandler
    this.pingInterval = opts?.pingInterval ?? 10000
    this.url = args.apiKey ? `${url}/${args.apiKey}` : url
    this.socket = new WebSocket(this.url, { handshakeTimeout: 5000 })

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

    if (++this.retryCount >= this.retryAttempts) {
      throw new Error('failed to reconnect')
    }

    setTimeout(
      () => {
        this.socket = new WebSocket(this.url, { handshakeTimeout: 5000 })
        this.initialize()
      },
      500 * this.retryCount ** 2
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

    const subscribeNewBlock: Subscription = { id: 'newBlock', method: 'subscribeNewBlock', params: {} }
    this.socket.send(JSON.stringify(subscribeNewBlock))
  }

  private async onMessage(message: WebSocket.MessageEvent): Promise<void> {
    try {
      const res: WebsocketRepsonse = JSON.parse(message.data.toString())

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
        case 'newTx':
          if ('tx' in res.data) {
            const newTx = res.data.tx

            if (Array.isArray(this.handleTransaction)) {
              this.handleTransaction.map(async (handleTransaction) => handleTransaction(newTx))
            } else {
              this.handleTransaction(newTx)
            }
          }
          return
      }
    } catch (err) {
      this.logger.error(err, `failed to handle message: ${JSON.stringify(message)}`)
    }
  }

  subscribeAddresses(addresses: string[]): void {
    const subscribeAddresses: Subscription = { id: 'newTx', method: 'subscribeAddresses', params: { addresses } }
    this.socket.send(JSON.stringify(subscribeAddresses))
  }
}
