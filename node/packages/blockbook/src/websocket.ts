import WebSocket from 'ws'
import { Logger } from '@shapeshiftoss/logger'
import { Tx } from './models'
import { NewBlock, WebsocketRepsonse } from '.'

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
  transactionHandler: TransactionHandler
  blockHandler: BlockHandler | Array<BlockHandler>
}

export interface Options {
  pingInterval?: number
  retryAttempts?: number
}

type TransactionHandler = (data: Tx) => Promise<void>
type BlockHandler = (data: NewBlock) => Promise<void>

export class WebsocketClient {
  private socket: WebSocket
  private url: string
  private pingTimeout?: NodeJS.Timeout
  private interval?: NodeJS.Timeout
  private retryCount = 0
  private addresses: Array<string> = []

  private handleTransaction: TransactionHandler | Array<TransactionHandler>
  private handleBlock: BlockHandler | Array<BlockHandler>

  private readonly pingInterval: number
  private readonly retryAttempts: number

  private logger = new Logger({ namespace: ['unchained', 'blockbook'], level: process.env.LOG_LEVEL })

  constructor(url: string, args: Args, opts?: Options) {
    this.handleTransaction = args.transactionHandler
    this.handleBlock = args.blockHandler
    this.url = args.apiKey ? `${url}/${args.apiKey}` : url
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

    const subscribeNewBlock: Subscription = { id: 'newBlock', method: 'subscribeNewBlock', params: {} }
    this.socket.send(JSON.stringify(subscribeNewBlock))

    const subscribeAddresses: Subscription = {
      id: 'newTx',
      method: 'subscribeAddresses',
      params: { addresses: this.addresses },
    }
    this.socket.send(JSON.stringify(subscribeAddresses))
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
    this.addresses = addresses
    const subscribeAddresses: Subscription = { id: 'newTx', method: 'subscribeAddresses', params: { addresses } }
    try {
      this.socket.send(JSON.stringify(subscribeAddresses))
    } catch (err) {
      this.logger.error(err, `failed to subscribe addresses: ${JSON.stringify(subscribeAddresses)}`)
    }
  }
}
