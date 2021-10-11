import WebSocket from 'ws'
import { ErrorResponse, RequestPayload, Topics, TxsTopicData } from '@shapeshiftoss/common-api'
import { SequencedETHParseTx } from '@shapeshiftoss/ethereum-ingester'

export { SequencedETHParseTx, ErrorResponse, RequestPayload, TxsTopicData }

export interface Connection {
  ws: WebSocket
  pingTimeout?: NodeJS.Timeout
}

export class Client {
  private readonly url: string
  private readonly connections: Record<Topics, Connection | undefined>
  private readonly sequencedData: Record<Topics, Array<boolean> | undefined>
  private readonly opts?: WebSocket.ClientOptions

  constructor(url: string, opts?: WebSocket.ClientOptions) {
    this.url = url
    this.opts = { ...opts, sessionTimeout: 10000 }

    this.connections = {
      txs: undefined,
    }

    this.sequencedData = {
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

  // TODO: add onError callback for any error cases
  // TODO: add batch key
  async subscribeTxs(
    data: TxsTopicData,
    onMessage: (message: SequencedETHParseTx | ErrorResponse) => void
  ): Promise<void> {
    if (this.connections.txs) return

    const ws = new WebSocket(this.url, this.opts)

    this.connections.txs = { ws }

    await new Promise((resolve) => (ws.onopen = () => this.onOpen('txs', resolve)))

    ws.onclose = () => this.connections.txs?.pingTimeout && clearTimeout(this.connections.txs.pingTimeout)
    ws.on('ping', () => this.heartbeat('txs'))

    const payload: RequestPayload = { method: 'subscribe', topic: 'txs', data }

    ws.onmessage = (event) => {
      // TODO: Reset timeout
      const message = JSON.parse(event.data.toString()) as SequencedETHParseTx | ErrorResponse

      if ('sequence' in message) {
        if (!this.sequencedData.txs) {
          this.sequencedData.txs = Array(message.total).fill(false)
        }

        this.sequencedData.txs[message.sequence] = true

        if (this.sequencedData.txs.every((val) => val)) {
          // TODO: Clear timeout
          console.log('all data received!')
        }
      }

      onMessage(message)
    }

    ws.send(JSON.stringify(payload))
    // TODO: Set initial timeout
  }

  unsubscribeTxs(): void {
    this.sequencedData.txs = undefined
    this.connections.txs?.ws.send(
      JSON.stringify({ method: 'unsubscribe', topic: 'txs', data: undefined } as RequestPayload)
    )
  }

  close(topic: Topics): void {
    this.sequencedData[topic] = undefined
    this.connections[topic]?.ws.close()
  }
}
