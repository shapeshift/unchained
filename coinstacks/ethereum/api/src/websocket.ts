import WebSocket from 'isomorphic-ws'
import { ErrorResponse, RequestPayload, Topics, TxsTopicData } from '@shapeshiftoss/common-api'
import { SequencedETHParseTx } from '@shapeshiftoss/ethereum-ingester'

export interface Connection {
  ws: WebSocket
  pingTimeout?: NodeJS.Timeout
}

export interface TransactionMessage {
  subscriptionId: string
  data: SequencedETHParseTx
}

export interface TxsParams {
  data: TxsTopicData | undefined
  onMessage: (message: SequencedETHParseTx) => void
  onError?: (err: ErrorResponse) => void
}

export class Client {
  private readonly url: string
  private readonly connections: Record<Topics, Connection | undefined>

  private txs: Record<string, TxsParams> = {}

  constructor(url: string) {
    this.url = url

    this.connections = {
      txs: undefined,
    }
  }

  private heartbeat(topic: Topics): void {
    const connection = this.connections[topic]
    if (!connection) return

    connection.pingTimeout && clearTimeout(connection.pingTimeout)
    connection.pingTimeout = setTimeout(() => connection?.ws.close(), 10000 + 5000)
  }

  private onOpen(topic: Topics, resolve: (value: unknown) => void): void {
    this.heartbeat(topic)
    resolve(true)
  }

  /**
   * Subscribe to transaction history and updates for newly confirmed and pending transactions.
   *
   * - Subsequent calls to `subscribeTxs` for the same `subscriptionId` will add additional addresses to be watched.
   *
   * @param subscriptionId unique id for grouping of addresses
   * @param data details for subscribe
   * @param data.topic specifies which topic to subscribe to
   * @param data.addresses list of addresses to subscribe to
   * @param onMessage handler for all transaction messages associated with `subscriptionId`
   * @param [onError] optional handler for any error messages associated with `subscriptionId`
   */
  async subscribeTxs(
    subscriptionId: string,
    data: TxsTopicData,
    onMessage: (message: SequencedETHParseTx) => void,
    onError?: (err: ErrorResponse) => void
  ): Promise<void> {
    // keep track of the onMessage and onError handlers associated with each subscriptionId
    this.txs[subscriptionId] = { onMessage, onError, data: undefined }

    if (this.connections.txs) {
      if (this.connections.txs.ws.readyState === 1) {
        // subscribe if connection exists and is ready
        this.connections.txs.ws.send(JSON.stringify({ subscriptionId, method: 'subscribe', data } as RequestPayload))
      } else {
        // queue up unique addresses for subscriptions if connection exists, but is not ready yet
        const txsData = this.txs[subscriptionId].data
        this.txs[subscriptionId].data = txsData
          ? { ...txsData, addresses: [...new Set(...txsData.addresses, ...data.addresses)] }
          : data
      }
      return
    }

    const ws = new WebSocket(this.url)
    this.connections.txs = { ws }

    // send connection errors to all subscription onError handlers
    ws.onerror = (event) => {
      Object.entries(this.txs).forEach(([subscriptionId, { onError }]) => {
        onError && onError({ subscriptionId, type: 'error', message: event.message })
      })
    }

    // clear heartbeat timeout on close
    ws.onclose = () => this.connections.txs?.pingTimeout && clearTimeout(this.connections.txs.pingTimeout)

    ws.onmessage = (event) => {
      if (!event) return

      // TODO: check event.type and handle non desired messages separately (noop)

      // trigger heartbeat keep alive on ping event
      if (event.data === 'ping') {
        this.heartbeat('txs')
        return
      }

      try {
        const message = JSON.parse(event.data.toString()) as TransactionMessage | ErrorResponse

        // narrow type to ErrorResponse if key `type` exists and forward to correct onError handler
        if ('type' in message) {
          const onErrorHandler = this.txs[message.subscriptionId]?.onError
          onErrorHandler && onErrorHandler(message)
          return
        }

        // forward the transaction message to the correct onMessage handler
        const onMessageHandler = this.txs[message.subscriptionId]?.onMessage
        onMessageHandler && onMessageHandler(message.data)
      } catch (err) {
        console.log(`failed to handle onmessage event: ${JSON.stringify(event)}: ${err}`)
      }
    }

    // wait for the connection to open
    await new Promise((resolve) => {
      ws.onopen = () => {
        // start heartbeat
        this.onOpen('txs', resolve)

        // subscribe to all queued subscriptions
        Object.values(this.txs).forEach(({ data }) => {
          if (!data) return
          const payload: RequestPayload = { subscriptionId, method: 'subscribe', data }
          ws.send(JSON.stringify(payload))
          delete this.txs[subscriptionId].data
        })

        // subscribe to initial subscription
        const payload: RequestPayload = { subscriptionId, method: 'subscribe', data }
        ws.send(JSON.stringify(payload))
      }
    })
  }

  /**
   * Unsubscribe from transaction history and updates for newly confirmed and pending transactions.
   *
   * - If `subscriptionId` is provided, any provided addresses will be unsubscribed from.
   *   If no addresses are provided, the subscription will be unsubscribed from.
   *
   * - If `subscriptionId` is not provided, all subscriptions will be unsubscribed from.
   *
   * @param [subscriptionId] unique identifier to unsubscribe from
   * @param [data] details for unsubscribe
   * @param data.topic specifies which topic to unsubscribe from
   * @param data.addresses list of addresses to unsubscribe from
   */
  unsubscribeTxs(subscriptionId?: string, data?: TxsTopicData): void {
    if (!subscriptionId) this.txs = {}
    if (subscriptionId && !data?.addresses.length) delete this.txs[subscriptionId]

    const payload: RequestPayload = {
      subscriptionId: subscriptionId ?? '',
      method: 'unsubscribe',
      data: { topic: 'txs', addresses: data?.addresses ?? [] },
    }

    this.connections.txs?.ws.send(JSON.stringify(payload))
  }

  /**
   * Close and unsubscribe from any subscriptions
   *
   * - If no topic is provided, all supported topics will be closed and unsubscribed from
   *
   * @param [topic] specifies which topic to close and unsubscribe from
   */
  close(topic?: Topics): void {
    const closeTxs = () => {
      this.unsubscribeTxs()
      this.connections.txs?.ws.close()
    }

    switch (topic) {
      case 'txs':
        closeTxs()
        break
      // close all connections if no topic is provided
      default:
        closeTxs()
    }
  }
}
