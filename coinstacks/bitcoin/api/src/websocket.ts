import WebSocket from 'isomorphic-ws'
import { ErrorResponse, RequestPayload, Topics, TxsTopicData } from '@shapeshiftoss/common-api'
import { SequencedBTCParseTx } from '@shapeshiftoss/bitcoin-ingester'

export interface Connection {
  ws: WebSocket
  pingTimeout?: NodeJS.Timeout
}

export type TransactionMessage = SequencedBTCParseTx & { subscriptionId?: string }

export class Client {
  private readonly url: string
  private readonly connections: Record<Topics, Connection | undefined>

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
    connection.pingTimeout = setTimeout(() => connection?.ws.close(), 10000 + 1000)
  }

  private onOpen(topic: Topics, resolve: (value: unknown) => void): void {
    this.heartbeat(topic)
    resolve(true)
  }

  async subscribeTxs(
    data: TxsTopicData,
    onMessage: (message: TransactionMessage) => void,
    onError?: (err: ErrorResponse) => void
  ): Promise<void> {
    if (this.connections.txs) return

    const ws = new WebSocket(this.url)
    this.connections.txs = { ws }

    if (onError) {
      ws.onerror = (event) => onError({ type: 'error', message: event.message })
    }

    ws.onclose = () => this.connections.txs?.pingTimeout && clearTimeout(this.connections.txs.pingTimeout)
    ws.onmessage = (event) => {
      if (event.data === 'ping') {
        this.heartbeat('txs')
        return
      }

      try {
        const message = JSON.parse(event.data.toString()) as TransactionMessage | ErrorResponse

        // narrow type to ErrorResponse if key `type` exists
        if ('type' in message) {
          onError && onError(message)
          return
        }

        onMessage(message)
      } catch (err) {
        if (onError && err instanceof Error) onError({ type: 'error', message: err.message })
      }
    }

    await new Promise((resolve) => (ws.onopen = () => this.onOpen('txs', resolve)))

    const payload: RequestPayload = { method: 'subscribe', data }
    ws.send(JSON.stringify(payload))
  }

  unsubscribeTxs(): void {
    this.connections.txs?.ws.send(
      JSON.stringify({ method: 'unsubscribe', topic: 'txs', data: undefined } as RequestPayload)
    )
  }

  close(topic: Topics): void {
    this.connections[topic]?.ws.close()
  }
}
