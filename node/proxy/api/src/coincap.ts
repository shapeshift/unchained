import WebSocket from 'ws'

import { BaseWebsocketClient, Args, Options, BaseConnectionHandler } from '@shapeshiftoss/websocket'
import { MarketDataClient, MarketDataConnectionHandler, MarketDataMessage } from './marketData'

// TODO: track assets and subscriptionId for clients
export class CoincapWebsocketClient extends BaseWebsocketClient implements MarketDataClient {
  clients = new Map<string, BaseConnectionHandler>()

  constructor(url: string, args: Args, opts?: Options) {
    super(url, { logger: args.logger }, opts)
  }

  protected onOpen(): void {}

  protected async onMessage(message: WebSocket.MessageEvent): Promise<void> {
    try {
      const res = JSON.parse(message.data.toString()) as Record<string, string>

      if (!res) return

      super.reset()
      this.handleMessage(res)
    } catch (err) {
      this.logger.error(err, `failed to handle message: ${JSON.stringify(message)}`)
    }
  }

  subscribe(clientId: string, subscriptionId: string, connection: MarketDataConnectionHandler, assets: Array<string>) {
    console.log(this.clients.size, { subscriptionId, assets })
    if (!this.clients.size) this.connect()
    this.clients.set(clientId, connection)
  }

  unsubscribe(clientId: string, subscriptionId: string, assets: Array<string>) {
    console.log({ subscriptionId, assets })
    if (!this.clients.has(clientId)) return
    this.clients.delete(clientId)
    if (!this.clients.size) this.socket?.close(1000)
  }

  private handleMessage(message: Record<string, string>): void {
    for (const [clientId, client] of this.clients) {
      try {
        const payload: MarketDataMessage = {
          type: 'price_update',
          source: 'coincap',
          data: message,
          timestamp: Date.now(),
        }

        client.publish(clientId, payload)
      } catch (error) {
        this.logger.error({ clientId, error }, 'failed to handle message')
      }
    }
  }
}
