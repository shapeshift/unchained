import WebSocket from 'ws'
import { SequencedETHParseTx } from '@shapeshiftoss/ethereum-ingester'
import { ErrorResponse, RequestPayload, Topics, TxsTopicData } from './sever'

export { SequencedETHParseTx, ErrorResponse, RequestPayload, TxsTopicData }

export class Client {
  private readonly url: string
  private readonly websockets: Record<Topics, WebSocket | undefined>
  private readonly sequencedData: Record<Topics, Array<boolean> | undefined>
  private readonly opts?: WebSocket.ClientOptions

  constructor(url: string, opts?: WebSocket.ClientOptions) {
    this.url = url
    this.opts = opts

    this.websockets = {
      txs: undefined,
    }

    this.sequencedData = {
      txs: undefined,
    }
  }

  async subscribeTxs(
    data: TxsTopicData,
    onMessage: (message: SequencedETHParseTx | ErrorResponse) => void
  ): Promise<void> {
    if (this.websockets.txs) return

    const ws = new WebSocket(this.url, this.opts)

    ws.onerror = (event) => console.log('error', event)

    this.websockets.txs = ws

    await new Promise((resolve) => (ws.onopen = () => resolve(true)))

    const payload: RequestPayload = { method: 'subscribe', topic: 'txs', data }

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data.toString()) as SequencedETHParseTx | ErrorResponse

      if ('sequence' in message) {
        if (!this.sequencedData.txs) {
          this.sequencedData.txs = Array(message.total).fill(false)
        }

        this.sequencedData.txs[message.sequence] = true

        if (this.sequencedData.txs.some((val) => val)) {
          console.log('all data received!')
        }
      }

      onMessage(message)
    }

    ws.send(JSON.stringify(payload))
  }

  unsubscribeTxs(): void {
    this.websockets.txs?.send(
      JSON.stringify({ method: 'unsubscribe', topic: 'txs', data: undefined } as RequestPayload)
    )
  }

  close(topic: Topics): void {
    this.websockets[topic]?.close()
  }
}
