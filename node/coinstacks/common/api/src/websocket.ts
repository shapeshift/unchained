import { Logger } from '@shapeshiftoss/logger'
import { Prometheus } from '@shapeshiftoss/prometheus'
import { AddressSubscriptionClient, BaseConnectionHandler } from '@shapeshiftoss/websocket'
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
  return data && typeof data === 'object' && data.topic === 'txs' && Array.isArray(data.addresses)
}

export class ConnectionHandler extends BaseConnectionHandler {
  private readonly registry: Registry
  private readonly client: AddressSubscriptionClient
  private readonly routes: Record<Topics, Methods>

  private constructor(
    websocket: WebSocket,
    registry: Registry,
    client: AddressSubscriptionClient,
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
    client: AddressSubscriptionClient,
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

    const route = this.routes[data.topic]

    if (!route || typeof route.subscribe !== 'function') {
      this.sendError(`subscribe method not implemented for topic: ${data.topic}`, subscriptionId)
      return
    }

    route.subscribe(subscriptionId, data)
  }

  onUnsubscribe(subscriptionId: string, data?: unknown): void {
    if (!isTxsTopicData(data)) {
      this.sendError(`no topic specified for unsubscribe`, subscriptionId)
      return
    }

    const route = this.routes[data.topic]

    if (!route || typeof route.unsubscribe !== 'function') {
      this.sendError(`unsubscribe method not implemented for topic: ${data.topic}`, subscriptionId)
      return
    }

    route.unsubscribe(subscriptionId, data)
  }

  onClose(): void {
    const unsubscribedAddresses: Array<string> = []

    for (const subscriptionId of this.subscriptionIds) {
      const addresses = this.registry.unsubscribe(this.clientId, subscriptionId, [])
      unsubscribedAddresses.push(...addresses)
    }

    this.client.unsubscribeAddresses(this.registry.getAddresses(), unsubscribedAddresses)
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

    const subscribedAddresses = this.registry.subscribe(this.clientId, subscriptionId, this, data.addresses)

    this.client.subscribeAddresses(this.registry.getAddresses(), subscribedAddresses)
  }

  private handleUnsubscribeTxs(subscriptionId: string, data?: TxsTopicData): void {
    const unsubscribedAddresses: Array<string> = []

    if (subscriptionId) {
      this.subscriptionIds.delete(subscriptionId)
      const addresses = this.registry.unsubscribe(this.clientId, subscriptionId, data?.addresses ?? [])
      unsubscribedAddresses.push(...addresses)
    } else {
      for (const subscriptionId of this.subscriptionIds) {
        const addresses = this.registry.unsubscribe(this.clientId, subscriptionId, [])
        unsubscribedAddresses.push(...addresses)
      }

      this.subscriptionIds.clear()
    }

    this.client.unsubscribeAddresses(this.registry.getAddresses(), unsubscribedAddresses)
  }
}
