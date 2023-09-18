import WebSocket from 'ws'
import { Logger } from '@shapeshiftoss/logger'
import { Tx } from './models'
import { NewBlock, WebsocketRepsonse } from '.'

export interface Subscription {
  id: string
  method: string
  params?: Record<string, string>
}

export interface Args {
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
  private retries = 0

  private handleTransaction: TransactionHandler | Array<TransactionHandler>
  private handleBlock: BlockHandler | Array<BlockHandler>

  private readonly pingInterval: number
  private readonly retryAttempts = 5

  private logger = new Logger({ namespace: ['unchained', 'blockbook'], level: process.env.LOG_LEVEL })

  constructor(url: string, args: Args, opts?: Options) {
    this.handleTransaction = args.transactionHandler
    this.handleBlock = args.blockHandler
    this.pingInterval = opts?.pingInterval ?? 10000
    this.url = url
    this.socket = new WebSocket(this.url, { handshakeTimeout: 5000 })

    this.initialize(false)
  }

  private initialize(retry: boolean): void {
    if (retry) {
      if (++this.retries >= this.retryAttempts) {
        throw new Error('failed to reconnect')
      }

      this.socket = new WebSocket(this.url, { handshakeTimeout: 5000 })
    }

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
    // TODO: retry with backoff
    this.initialize(true)
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
    this.retries = 0
    this.interval = setInterval(() => {
      this.socket.ping()
    }, this.pingInterval)
    this.heartbeat()

    const newBlock: Subscription = {
      id: 'newBlock',
      method: 'subscribeNewBlock',
      params: {},
    }

    const newTx: Subscription = {
      id: 'newTx',
      method: 'subscribeNewTransaction',
      params: {},
    }

    this.socket.send(JSON.stringify(newBlock))
    this.socket.send(JSON.stringify(newTx))
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
              await Promise.all(this.handleBlock.map(async (handleBlock) => handleBlock(newBlock)))
            } else {
              await this.handleBlock(newBlock)
            }
          }
          return
        case 'newTx':
          if ('txid' in res.data) {
            const newTx = res.data
            if (Array.isArray(this.handleTransaction)) {
              await Promise.all(this.handleTransaction.map(async (handleTransaction) => handleTransaction(newTx)))
            } else {
              await this.handleTransaction(newTx)
            }
          }
          return
      }
    } catch (err) {
      this.logger.error(err, `failed to handle message: ${JSON.stringify(message)}`)
    }
  }
}
