import { Logger } from '@shapeshiftoss/logger'
import { WebsocketClient as BaseWebsocketClient, Args, Options, Subscription } from '@shapeshiftoss/websocket'
import WebSocket from 'ws'
import {
  isWebsocketResponse,
  isWebsocketSubscribeResponse,
  WebsocketResponse,
  WebsocketSubscribeResponse,
} from './types'
import { Logs } from '@solana/web3.js'

const logger = new Logger({ namespace: ['unchained', 'solana', 'websocket'], level: process.env.LOG_LEVEL })

interface WebsocketArgs extends Omit<Args, 'logger'> {
  transactionHandler: TransactionHandler | Array<TransactionHandler>
}

type TransactionHandler = (data: Logs) => Promise<void>

export class WebsocketClient extends BaseWebsocketClient {
  private handleTransaction: TransactionHandler | Array<TransactionHandler>

  private addresses: Array<string> = []
  private subscriptionsIds: Array<number> = []

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

      subscribeAddresses.forEach((subscribeAddress) => {
        try {
          this.socket.send(JSON.stringify(subscribeAddress))
        } catch (err) {
          this.logger.debug(err, `failed to subscribe addresses: ${JSON.stringify(subscribeAddress)}`)
        }
      })
    }
  }

  protected async onMessage(message: WebSocket.MessageEvent): Promise<void> {
    try {
      const res: WebsocketResponse | WebsocketSubscribeResponse = JSON.parse(message.data.toString())

      if (isWebsocketSubscribeResponse(res)) {
        this.subscriptionsIds = [...this.subscriptionsIds, res.result]
      }

      switch (res.method) {
        case 'logsNotification':
          if (isWebsocketResponse(res)) {
            if (Array.isArray(this.handleTransaction)) {
              this.handleTransaction.map(async (handleTransaction) => handleTransaction(res.params.result.value))
            } else {
              this.handleTransaction(res.params.result.value)
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

    this.subscriptionsIds.forEach((id) => {
      this.socket.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'newTxUnsubscribe',
          method: 'logsUnsubscribe',
          params: [id],
        })
      )
    })

    this.subscriptionsIds = []

    subscribeAddresses.forEach((subscribeAddress) => {
      try {
        this.socket.send(JSON.stringify(subscribeAddress))
      } catch (err) {
        this.logger.debug(err, `failed to subscribe addresses: ${JSON.stringify(subscribeAddress)}`)
      }
    })
  }

  private getAddressesSubscription(): Subscription[] {
    return this.addresses.map((address) => ({
      jsonrpc: '2.0',
      id: 'newTx',
      method: 'logsSubscribe',
      params: [
        {
          mentions: [address],
        },
      ],
    }))
  }
}
