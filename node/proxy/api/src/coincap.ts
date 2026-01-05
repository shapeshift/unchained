import WebSocket from 'ws'

import { BaseWebsocketClient, Args, Options, BaseConnectionHandler } from '@shapeshiftoss/websocket'
import { MarketDataClient, MarketDataConnectionHandler, MarketDataMessage } from './marketData'

export class CoincapWebsocketClient extends BaseWebsocketClient implements MarketDataClient {
  clients = new Map<string, BaseConnectionHandler>()
  // clientId -> subscriptionId -> assets
  subscriptions = new Map<string, Map<string, string[]>>()

  constructor(url: string, args: Args, opts?: Options) {
    super(url, { logger: args.logger }, opts)
  }

  protected onOpen(): void {}

  protected async onMessage(message: WebSocket.MessageEvent): Promise<void> {
    try {
      const res = JSON.parse(message.data.toString()) as Record<string, string>

      super.reset()
      this.handleMessage(res)
    } catch (err) {
      this.logger.error(err, `failed to handle message: ${JSON.stringify(message)}`)
    }
  }

  subscribe(clientId: string, subscriptionId: string, connection: MarketDataConnectionHandler, assets: Array<string>) {
    if (!this.clients.size) this.connect()
    this.clients.set(clientId, connection)

    if (!this.subscriptions.has(clientId)) {
      this.subscriptions.set(clientId, new Map<string, string[]>())
    }

    this.subscriptions.get(clientId)!.set(subscriptionId, assets)
  }

  unsubscribe(clientId: string, subscriptionId?: string) {
    const clientSubscriptions = this.subscriptions.get(clientId)

    if (clientSubscriptions && subscriptionId) {
      // Remove specific subscription
      clientSubscriptions.delete(subscriptionId)

      // If client has no more subscriptions, remove them entirely
      if (clientSubscriptions.size === 0) {
        this.clients.delete(clientId)
        this.subscriptions.delete(clientId)
      }
    } else {
      // Remove all subscriptions for this client
      this.clients.delete(clientId)
      this.subscriptions.delete(clientId)
    }

    // Close connection if no more clients
    if (!this.clients.size) this.socket?.close(1000)
  }

  private handleMessage(message: Record<string, string>): void {
    for (const [clientId, client] of this.clients) {
      try {
        const clientSubscriptions = this.subscriptions.get(clientId)
        if (!clientSubscriptions) continue

        // Send updates for each subscription
        for (const [subscriptionId, assets] of clientSubscriptions) {
          // Filter data to only include assets this subscription requested
          const filteredData: Record<string, string> = {}
          for (const asset of assets) {
            if (message[asset] !== undefined) {
              filteredData[asset] = message[asset]
            }
          }

          // Only send if there's relevant data for this subscription
          if (Object.keys(filteredData).length > 0) {
            const payload: MarketDataMessage = {
              type: 'price_update',
              source: 'coincap',
              data: filteredData,
              timestamp: Date.now(),
            }

            client.publish(subscriptionId, payload)
          }
        }
      } catch (error) {
        this.logger.error({ clientId, error }, 'failed to handle message')
      }
    }
  }
}
