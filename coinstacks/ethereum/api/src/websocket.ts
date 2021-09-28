import { v4 } from 'uuid'
import { Connection, Message, Queue } from '@shapeshiftoss/common-ingester'

export interface TxsTopicData {
  addresses: Array<string>
  blockNumber?: number
}

export interface WebsocketError {
  type: 'error'
  message: string
}

export interface SubscriptionPayload {
  method: 'subscribe' | 'unsubscribe' | 'update'
  topic: string
  data: TxsTopicData
}

export class WebSocketConnectionHandler {
  public readonly id: string
  private rabbit: Connection
  private websocket: WebSocket
  private routes: {
    [topics: string]: {
      subscribe?: (data: any) => Promise<void>
      unsubscribe?: (data: any) => Promise<void>
      update?: (data: any) => Promise<void>
    }
  }
  private queue?: Queue

  constructor(websocket: WebSocket) {
    this.id = v4()
    this.rabbit = new Connection(process.env.BROKER_URL)
    this.websocket = websocket
    this.routes = {
      txs: {
        subscribe: (data: TxsTopicData) => this._txs(data),
      },
    }
  }

  start(): void {
    this.websocket.onmessage = (event: MessageEvent<SubscriptionPayload>) => this._onMessage(event)
    this.websocket.onclose = () => this._onClose()
  }

  private async _onMessage(event: MessageEvent<SubscriptionPayload>): Promise<void> {
    try {
      const payload = JSON.parse(event.data.toString()) as SubscriptionPayload

      const callback = this.routes[payload.topic][payload.method]
      if (callback) await callback(payload.data)
      else
        this.websocket.send(
          JSON.stringify({
            type: 'error',
            message: `route topic (${payload.topic}) method (${payload.method}) not found`,
          })
        )
    } catch (err) {
      console.error('err', err)
      this.websocket.close()
    }
  }

  private async _onClose() {
    await this.queue?.delete()
  }

  private async _txs(data: TxsTopicData) {
    if (!data.addresses || !data.addresses.length) {
      const error: WebsocketError = {
        type: 'error',
        message: 'addresses required',
      }
      this.websocket.send(JSON.stringify(error))
      return
    }

    const registryExchange = this.rabbit.declareExchange('exchange.unchained', '', { noCreate: true })

    // Create dynamic queue with topic client_id binding
    const txExchange = this.rabbit.declareExchange('exchange.ethereum.tx.client', '', { noCreate: true })

    this.queue = this.rabbit.declareQueue(`queue.ethereum.tx.${this.id}`)
    console.log('created queue:', this.queue.name)
    this.queue.bind(txExchange, this.id)

    await this.rabbit.completeConfiguration()

    const msg = new Message({
      client_id: this.id,
      action: 'register',
      registration: {
        addresses: data.addresses,
      },
    })

    // Register account with unique uuid and associated address. Update ingester_meta with the appropriate block height
    // Trigger initial sync with fake "mempool" transaction (see ingester/register.ts)
    registryExchange.send(msg, 'ethereum.registry')

    const onMessage = () => async (message: Message) => {
      const content = message.getContent()
      // Send all messages back over websocket to client
      this.websocket.send(JSON.stringify(content))
    }

    // Create a Worker to consume from dynamic queue created above
    this.queue.activateConsumer(onMessage())
  }
}
