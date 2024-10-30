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
  private subscriptionIds: Array<number> = []
  private currentId = 0

  constructor(_url: string, args: WebsocketArgs, opts?: Options) {
    const url = args.apiKey ? `${_url}?api-key=${args.apiKey}` : _url
    super(url, { logger }, opts)

    this.handleTransaction = args.transactionHandler

    this.initialize()
  }

  protected onOpen(): void {
    if (this.addresses.length > 0) this.subscribeAddresses(this.addresses)
  }

  protected async onMessage(message: WebSocket.MessageEvent): Promise<void> {
    try {
      const res: WebsocketResponse | WebsocketSubscribeResponse = JSON.parse(message.data.toString())

      if (isWebsocketSubscribeResponse(res)) {
        if (res.id === this.currentId.toString()) {
          this.subscriptionIds.push(res.result)
        } else {
          this.unsubscribe(res.result)
        }
        return
      }

      switch (res.method) {
        case 'logsNotification': {
          if (isWebsocketResponse(res)) {
            const subscriptionId = res.params.subscription

            if (this.subscriptionIds.includes(subscriptionId)) {
              super.reset()

              const tx = res.params.result.value
              logger.debug({ fn: 'onMessage' }, `tx: ${tx.signature}`)

              if (Array.isArray(this.handleTransaction)) {
                this.handleTransaction.forEach(async (handleTransaction) => handleTransaction(tx))
              } else {
                this.handleTransaction(tx)
              }
            } else {
              this.unsubscribe(subscriptionId)
            }
          }
        }
      }
    } catch (err) {
      this.logger.error(err, `failed to handle message: ${JSON.stringify(message)}`)
    }
  }

  subscribeAddresses(addresses: string[]): void {
    this.addresses = addresses
    this.currentId++

    this.subscriptionIds.forEach((subscriptionId) => {
      this.unsubscribe(subscriptionId)
    })

    this.subscriptionIds = []

    this.addresses.forEach((address) => {
      const subscription: Subscription = {
        jsonrpc: '2.0',
        id: this.currentId.toString(),
        method: 'logsSubscribe',
        params: [{ mentions: [address] }, { commitment: 'confirmed' }],
      }

      try {
        this.socket.send(JSON.stringify(subscription))
      } catch (err) {
        this.logger.debug(err, `failed to subscribe address: ${JSON.stringify(subscription)}`)
      }
    })
  }

  private unsubscribe(subscriptionId: number): void {
    this.socket.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'unsubscribe',
        method: 'logsUnsubscribe',
        params: [subscriptionId],
      })
    )
  }
}
