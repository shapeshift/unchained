import WebSocket from 'ws'
import { ErrorResponse, RequestPayload, Topics, TxsTopicData } from '../../../common/api'
import { SequencedETHParseTx } from '../../ingester'

export { ErrorResponse, SequencedETHParseTx, Topics, TxsTopicData }

export interface Connection {
  ws: WebSocket
  pingTimeout?: NodeJS.Timeout
}

export type ClientOptions = WebSocket.ClientOptions

export class Client {
  private readonly url: string
  private readonly connections: Record<Topics, Connection | undefined>
  private readonly opts?: ClientOptions

  constructor(url: string, opts?: ClientOptions) {
    this.url = url
    this.opts = { ...opts, sessionTimeout: 10000 }

    this.connections = {
      txs: undefined,
    }
  }

  private heartbeat(topic: Topics): void {
    const connection = this.connections[topic]
    if (!connection) return

    connection.pingTimeout && clearTimeout(connection.pingTimeout)
    connection.pingTimeout = setTimeout(() => connection?.ws.terminate(), 10000 + 1000)
  }

  private onOpen(topic: Topics, resolve: (value: unknown) => void): void {
    this.heartbeat(topic)
    resolve(true)
  }

  async subscribeTxs(
    data: TxsTopicData,
    onMessage: (message: SequencedETHParseTx) => void,
    onError?: (err: ErrorResponse) => void
  ): Promise<void> {
    if (this.connections.txs) return

    const ws = new WebSocket(this.url, this.opts)
    this.connections.txs = { ws }

    onError && ws.on('error', (event) => onError({ type: 'error', message: event.message }))

    ws.on('ping', () => this.heartbeat('txs'))
    ws.onclose = () => this.connections.txs?.pingTimeout && clearTimeout(this.connections.txs.pingTimeout)
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data.toString()) as SequencedETHParseTx | ErrorResponse
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

    const payload: RequestPayload = { method: 'subscribe', topic: 'txs', data }
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
