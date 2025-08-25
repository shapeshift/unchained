import { Logger } from '@shapeshiftoss/logger'
import { Prometheus } from '@shapeshiftoss/prometheus'
import { AddressSubscriptionWebsocketClient, BaseConnectionHandler } from '@shapeshiftoss/websocket'
import WebSocket from 'ws'
import { Registry } from './registry'

export type Topics = 'txs'

export interface TxsTopicData {
  topic: 'txs'
  addresses: Array<string>
}

export interface Methods {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe: (subscriptionId: string, data?: any) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unsubscribe: (subscriptionId: string, data?: any) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isTxsTopicData(data: any): data is TxsTopicData {
  return data && 'topic' in data
}

export class ConnectionHandler extends BaseConnectionHandler {
  private readonly registry: Registry
  private readonly client: AddressSubscriptionWebsocketClient
  private readonly routes: Record<Topics, Methods>

  private constructor(
    websocket: WebSocket,
    registry: Registry,
    client: AddressSubscriptionWebsocketClient,
    prometheus: Prometheus,
    logger: Logger
  ) {
    super(websocket, prometheus, logger)

    this.registry = registry
    this.client = client
    this.routes = {
      txs: {
        subscribe: (subscriptionId: string, data?: TxsTopicData) => this.handleSubscribeTxs(subscriptionId, data),
        unsubscribe: (subscriptionId: string, data?: TxsTopicData) => this.handleUnsubscribeTxs(subscriptionId, data),
      },
    }
  }

  static start(
    websocket: WebSocket,
    registry: Registry,
    client: AddressSubscriptionWebsocketClient,
    prometheus: Prometheus,
    logger: Logger
  ): void {
    new ConnectionHandler(websocket, registry, client, prometheus, logger)
  }

  onSubscribe(subscriptionId: string, data?: unknown): void {
    if (!isTxsTopicData(data)) {
      this.sendError(`no topic specified for subscribe`, subscriptionId)
      return
    }

    const callback = this.routes[data.topic].subscribe
    if (callback) {
      callback(subscriptionId, data)
    } else {
      this.sendError(`subscribe method not implemented for topic: ${data.topic}`, subscriptionId)
    }
  }

  onUnsubscribe(subscriptionId: string, data?: unknown): void {
    if (!isTxsTopicData(data)) {
      this.sendError(`no topic specified for unsubscribe`, subscriptionId)
      return
    }

    const callback = this.routes[data.topic].unsubscribe
    if (callback) {
      callback(subscriptionId, data)
    } else {
      this.sendError(`unsubscribe method not implemented for topic: ${data.topic}`, subscriptionId)
    }
  }

  onClose(): void {
    for (const subscriptionId of this.subscriptionIds) {
      this.registry.unsubscribe(this.clientId, subscriptionId, [])
    }

    this.client.subscribeAddresses(this.registry.getAddresses())
  }

  private handleSubscribeTxs(subscriptionId: string, data?: TxsTopicData): void {
    if (!subscriptionId) {
      this.sendError('subscriptionId required', subscriptionId)
      return
    }

    if (!data?.addresses?.length) {
      this.sendError('addresses required', subscriptionId)
      return
    }

    this.subscriptionIds.add(subscriptionId)
    this.registry.subscribe(this.clientId, subscriptionId, this, data.addresses)
    this.client.subscribeAddresses(this.registry.getAddresses())
  }

  private handleUnsubscribeTxs(subscriptionId: string, data?: TxsTopicData): void {
    if (subscriptionId) {
      this.subscriptionIds.delete(subscriptionId)
      this.registry.unsubscribe(this.clientId, subscriptionId, data?.addresses ?? [])
    } else {
      for (const subscriptionId of this.subscriptionIds) {
        this.registry.unsubscribe(this.clientId, subscriptionId, [])
      }

      this.subscriptionIds.clear()
    }

    this.client.subscribeAddresses(this.registry.getAddresses())
  }
}
