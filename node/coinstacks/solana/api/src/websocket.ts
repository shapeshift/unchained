import { Logger } from '@shapeshiftoss/logger'
import { WebsocketClient as BaseWebsocketClient, Args, Options, Subscription } from '@shapeshiftoss/websocket'
import WebSocket from 'ws'
import { Transaction, WebsocketResponse } from './types'

const logger = new Logger({ namespace: ['unchained', 'solana', 'websocket'], level: process.env.LOG_LEVEL })

interface WebsocketArgs extends Omit<Args, 'logger'> {
  transactionHandler: TransactionHandler | Array<TransactionHandler>
}

type TransactionHandler = (data: Transaction) => Promise<void>

export class WebsocketClient extends BaseWebsocketClient {
  private handleTransaction: TransactionHandler | Array<TransactionHandler>

  private addresses: Array<string> = []

  constructor(_url: string, args: WebsocketArgs, opts?: Options) {
    const url = args.apiKey ? `${_url}?api-key=${args.apiKey}` : _url
    super(url, { logger }, opts)

    this.handleTransaction = args.transactionHandler

    this.initialize()

    this.socket.onmessage = (msg) => this.onMessage(msg)
    this.socket.onopen = () => this.onOpen()
  }

  protected onOpen(): void {
    super._onOpen()

    if (this.addresses.length > 0) {
      const subscribeAddresses = this.getAddressesSubscription()
      this.socket.send(JSON.stringify(subscribeAddresses))
    }
  }

  protected async onMessage(message: WebSocket.MessageEvent): Promise<void> {
    try {
      const res: WebsocketResponse = JSON.parse(message.data.toString())

      switch (res.method) {
        case 'transactionNotification':
          if ('result' in res.params) {
            if (Array.isArray(this.handleTransaction)) {
              this.handleTransaction.map(async (handleTransaction) => handleTransaction(res.params.result.transaction))
            } else {
              this.handleTransaction(res.params.result.transaction)
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
      method: 'transactionSubscribe',
      params: [
        {
          accountInclude: this.addresses,
        },
        {
          encoding: 'jsonParsed',
          transactionDetails: 'full',
          showRewards: true,
          maxSupportedTransactionVersion: 0,
        },
      ],
    }
  }
}