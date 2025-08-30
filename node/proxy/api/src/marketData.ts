import { Logger } from '@shapeshiftoss/logger'
import WebSocket from 'ws'

import { BaseConnectionHandler, MessageResponse } from '@shapeshiftoss/websocket'
import { Prometheus } from '@shapeshiftoss/prometheus'

export interface MarketDataMessage extends MessageResponse {
  type: 'price_update'
  source: string
  data: Record<string, string>
  timestamp: number
}

export interface SubscribePayload {
  assets: Array<string>
}

function isSubscribePayload(data: unknown): data is SubscribePayload {
  return data !== null && typeof data === 'object' && 'assets' in data
}

export interface MarketDataClient {
  subscribe(
    clientId: string,
    subscriptionId: string,
    connection: MarketDataConnectionHandler,
    assets: Array<string>
  ): void
  unsubscribe(clientId: string, subscriptionId?: string): void
}

export class MarketDataConnectionHandler extends BaseConnectionHandler {
  private readonly client: MarketDataClient

  private constructor(websocket: WebSocket, client: MarketDataClient, prometheus: Prometheus, logger: Logger) {
    super(websocket, prometheus, logger)

    this.client = client
  }

  static start(websocket: WebSocket, client: MarketDataClient, prometheus: Prometheus, logger: Logger): void {
    new MarketDataConnectionHandler(websocket, client, prometheus, logger)
  }

  onSubscribe(subscriptionId: string, data?: unknown): void {
    if (!subscriptionId) {
      this.sendError('subscriptionId required', subscriptionId)
      return
    }

    if (!isSubscribePayload(data)) {
      this.sendError(`invalid subscription payload, no assets provided`, subscriptionId)
      return
    }

    this.subscriptionIds.add(subscriptionId)
    this.client.subscribe(this.clientId, subscriptionId, this, data.assets)
  }

  onUnsubscribe(subscriptionId: string): void {
    if (subscriptionId) {
      this.subscriptionIds.delete(subscriptionId)
      this.client.unsubscribe(this.clientId, subscriptionId)
    } else {
      this.subscriptionIds.clear()
      this.client.unsubscribe(this.clientId)
    }
  }

  onClose(): void {
    this.client.unsubscribe(this.clientId)
  }
}
