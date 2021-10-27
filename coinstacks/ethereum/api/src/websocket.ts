import { ErrorResponse, RequestPayload, Topics, TxsTopicData } from '@shapeshiftoss/common-api'
import { SequencedETHParseTx } from '@shapeshiftoss/ethereum-ingester'
import { Observable } from 'rxjs'
import WebSocket from 'ws'

export interface Connection {
  ws: WebSocket
  pingTimeout?: NodeJS.Timeout
}

export class Client {
  private readonly url: string

  constructor(url: string) {
    this.url = url
  }

  async subscribe(topic: 'txs', data: TxsTopicData): Promise<Observable<SequencedETHParseTx>>
  async subscribe(topic: Topics, data: unknown): Promise<Observable<unknown>> {
    let readyResolver: () => void
    const readyPromise = new Promise<void>((resolve) => (readyResolver = resolve))
    const out = new Observable((subscriber) => {
      const ws = new WebSocket(this.url)

      const send = (payload: RequestPayload) => {
        ws.send(JSON.stringify(payload))
      }
      const unsubscribe = () => send({ method: 'unsubscribe', topic })

      let pingTimeout: NodeJS.Timeout
      const heartbeat = () => {
        clearTimeout(pingTimeout)
        pingTimeout = setTimeout(() => ws.terminate(), 10000 + 1000)
      }

      ws.onopen = () => {
        heartbeat()
        subscriber.add(unsubscribe)
        readyResolver()
      }
      ws.onclose = () => {
        clearTimeout(pingTimeout)
        subscriber.remove(unsubscribe)
        subscriber.complete()
      }

      ws.on('ping', () => heartbeat())
      ws.on('error', (event) => subscriber.error(event.message))

      ws.onmessage = (event) => {
        if (event.data === 'ping') {
          heartbeat()
          return
        }
        try {
          const message = JSON.parse(event.data.toString()) as SequencedETHParseTx | ErrorResponse
          if (message.type === 'error') {
            subscriber.error(message.message)
          } else {
            subscriber.next(message)
          }
        } catch (err) {
          if (err instanceof Error) {
            subscriber.error(err.message)
          } else {
            subscriber.error(String(err))
          }
        }
      }

      send({ method: 'subscribe', topic, data })
    })
    await readyPromise
    return out
  }
}
