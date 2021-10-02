import WebSocket from 'ws'
import { ETHParseTx } from '@shapeshiftoss/ethereum-ingester'
import { ErrorResponse, RequestPayload, Topics, TxsTopicData } from './sever'

export class Client {
  private readonly url: string
  private readonly opts: WebSocket.ClientOptions

  private readonly websockets: Record<Topics, WebSocket | undefined>

  constructor(url: string, opts: WebSocket.ClientOptions) {
    this.url = url
    this.opts = opts

    this.websockets = {
      txs: undefined,
    }
  }

  async subscribeTxs(data: TxsTopicData, onMessage: (message: ETHParseTx | ErrorResponse) => void): Promise<void> {
    if (this.websockets.txs) {
      throw new Error('already subscribed...')
    }

    const ws = new WebSocket(this.url, this.opts)

    ws.onerror = (event) => console.log('error', event)

    await new Promise((resolve) => (ws.onopen = () => resolve(true)))

    this.websockets.txs = ws

    const payload: RequestPayload = { method: 'subscribe', topic: 'txs', data }

    ws.onmessage = (event) => onMessage(JSON.parse(event.data.toString()))
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
