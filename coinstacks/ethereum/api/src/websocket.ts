import WebSocket from 'isomorphic-ws'
import { ErrorResponse, RequestPayload, Topics, TxsTopicData } from '@shapeshiftoss/common-api'
import { SequencedETHParseTx } from '@shapeshiftoss/ethereum-ingester'

export interface Connection {
  ws: WebSocket
  pingTimeout?: NodeJS.Timeout
}

export interface TransactionMessage {
  id: string
  data: SequencedETHParseTx
}

export class Client {
  private readonly url: string
  private readonly connections: Record<Topics, Connection | undefined>

  private onMessageTxs: Record<string, (message: SequencedETHParseTx) => void> = {}
  private queueTxs: Record<string, TxsTopicData> = {}

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

  async subscribeTxs(
    data: TxsTopicData,
    onMessage: (message: SequencedETHParseTx) => void,
    onError?: (err: ErrorResponse) => void
  ): Promise<void> {
    //TODO: track most recent onError handler
    this.onMessageTxs[data.id] = onMessage

    if (this.connections.txs && this.connections.txs.ws.readyState !== 1) {
      this.queueTxs[data.id] = data
      return
    }

    if (this.connections.txs && this.connections.txs.ws.readyState === 1) {
      const payload: RequestPayload = { method: 'subscribe', data }
      this.connections.txs.ws.send(JSON.stringify(payload))
      return
    }

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

        const onMessage = this.onMessageTxs[message.id]
        onMessage && onMessage(message.data)
      } catch (err) {
        if (onError && err instanceof Error) onError({ type: 'error', message: err.message })
      }
    }

    await new Promise(
      (resolve) =>
        (ws.onopen = () =>
          this.onOpen('txs', () => {
            Object.values(this.queueTxs).forEach((data) => {
              const payload: RequestPayload = { method: 'subscribe', data }
              ws.send(JSON.stringify(payload))
            })
            this.queueTxs = {}
            resolve(undefined)
          }))
    )
  }

  unsubscribeTxs(): void {
    this.onMessageTxs = {}
    this.connections.txs?.ws.send(
      JSON.stringify({ method: 'unsubscribe', topic: 'txs', data: undefined } as RequestPayload)
    )
  }

  close(topic: Topics): void {
    switch (topic) {
      case 'txs':
        this.unsubscribeTxs()
        break
    }
    this.connections[topic]?.ws.close()
  }
}
