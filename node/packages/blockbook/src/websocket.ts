import { Logger } from '@shapeshiftoss/logger'
import { WebsocketClient as BaseWebsocketClient, Args, Options, Subscription } from '@shapeshiftoss/websocket'
import WebSocket from 'ws'
import { Tx } from './models'
import { NewBlock, WebsocketRepsonse } from '.'

const logger = new Logger({ namespace: ['unchained', 'blockbook', 'websocket'], level: process.env.LOG_LEVEL })

type TransactionHandler = (data: Tx) => Promise<void>
type BlockHandler = (data: NewBlock) => Promise<void>

interface WebsocketArgs extends Omit<Args, 'logger'> {
  transactionHandler: TransactionHandler | Array<TransactionHandler>
  blockHandler: BlockHandler | Array<BlockHandler>
}

export class WebsocketClient extends BaseWebsocketClient {
  private handleTransaction: TransactionHandler | Array<TransactionHandler>
  private handleBlock: BlockHandler | Array<BlockHandler>

  private addresses: Array<string> = []

  constructor(_url: string, args: WebsocketArgs, opts?: Options) {
    const url = args.apiKey ? `${_url}/${args.apiKey}` : _url
    super(url, { logger }, opts)

    this.handleTransaction = args.transactionHandler
    this.handleBlock = args.blockHandler

    super.initialize()
  }

  protected onOpen(): void {
    const subscribeNewBlock: Subscription = { jsonrpc: '2.0', id: 'newBlock', method: 'subscribeNewBlock', params: {} }
    this.socket.send(JSON.stringify(subscribeNewBlock))

    if (this.addresses.length) {
      const subscribeAddresses = this.getAddressesSubscription()
      this.socket.send(JSON.stringify(subscribeAddresses))
    }
  }

  protected async onMessage(message: WebSocket.MessageEvent): Promise<void> {
    try {
      const res: WebsocketRepsonse = JSON.parse(message.data.toString())

      if (!res.data) return

      switch (res.id) {
        case 'newBlock':
          if ('hash' in res.data) {
            super.reset()

            const newBlock = res.data
            logger.debug({ fn: 'onMessage' }, `block: ${newBlock.height}`)

            if (Array.isArray(this.handleBlock)) {
              this.handleBlock.map(async (handleBlock) => handleBlock(newBlock))
            } else {
              this.handleBlock(newBlock)
            }
          }
          return
        case 'newTx':
          if ('tx' in res.data) {
            super.reset()

            const newTx = res.data.tx
            logger.debug({ fn: 'onMessage' }, `tx: ${newTx.txid}`)

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
    const subscribeAddresses = this.getAddressesSubscription()

    try {
      this.socket.send(JSON.stringify(subscribeAddresses))
    } catch (err) {
      this.logger.debug(err, `failed to subscribe addresses: ${JSON.stringify(subscribeAddresses)}`)
    }
  }

  private getAddressesSubscription(): Subscription {
    return {
      jsonrpc: '2.0',
      id: 'newTx',
      method: 'subscribeAddresses',
      params: { addresses: this.addresses, newBlockTxs: true },
    }
  }
}
