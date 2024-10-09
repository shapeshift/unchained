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
  private subscriptionsIds: Map<number, number> = new Map()
  private currentSubscriptionId: number = 0

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
      this.subscribeAddresses(this.addresses)
    }
  }

  protected async onMessage(message: WebSocket.MessageEvent): Promise<void> {
    try {
      const res: WebsocketResponse | WebsocketSubscribeResponse = JSON.parse(message.data.toString())

      if (isWebsocketSubscribeResponse(res) && typeof res.result === 'number') {
        if (res.id === this.currentSubscriptionId.toString()) {
          this.subscriptionsIds.set(this.currentSubscriptionId, res.result)
        } else {
          this.unsubscribe(res.result)
        }
      }

      switch (res.method) {
        case 'logsNotification':
          if (isWebsocketResponse(res)) {
            const subscriptionId = res.params.subscription
            const relevantSubscriptionId = Array.from(this.subscriptionsIds.entries()).find(
              ([, value]) => value === subscriptionId
            )?.[0]

            if (relevantSubscriptionId === this.currentSubscriptionId) {
              if (Array.isArray(this.handleTransaction)) {
                this.handleTransaction.forEach(async (handleTransaction) => handleTransaction(res.params.result.value))
              } else {
                this.handleTransaction(res.params.result.value)
              }
            } else {
              this.unsubscribe(subscriptionId)
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
    this.currentSubscriptionId++

    this.subscriptionsIds.forEach((subscriptionId) => {
      this.unsubscribe(subscriptionId)
    })

    this.subscriptionsIds.clear()

    const subscribeAddresses = this.getAddressesSubscription()
    subscribeAddresses.forEach((subscribeAddress) => {
      try {
        this.socket.send(JSON.stringify(subscribeAddress))
      } catch (err) {
        this.logger.debug(err, `failed to subscribe addresses: ${JSON.stringify(subscribeAddress)}`)
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

  private getAddressesSubscription(): Subscription[] {
    return this.addresses.map((address) => ({
      jsonrpc: '2.0',
      id: this.currentSubscriptionId.toString(),
      method: 'logsSubscribe',
      params: [
        {
          mentions: [address],
        },
      ],
    }))
  }
}
