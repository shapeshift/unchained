import WebSocket from 'ws'
import { v4 } from 'uuid'
import { Connection, Exchange, Message, Queue } from 'amqp-ts'
import { RegistryMessage } from '@shapeshiftoss/common-ingester'
import { IngesterMetadata } from '@shapeshiftoss/common-mongo'
import { logger } from '@shapeshiftoss/logger'

const BROKER_URL = process.env.BROKER_URL as string

if (!BROKER_URL) throw new Error('BROKER_URL env var not set')

export interface TxsTopicData {
  addresses: Array<string>
  blockNumber?: number
}

export interface ErrorResponse {
  type: 'error'
  message: string
}

export type Topics = 'txs'

export interface Methods {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe: (data: any) => Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unsubscribe?: (data: any) => Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update?: (data: any) => Promise<void>
}

export interface RequestPayload {
  method: 'subscribe' | 'unsubscribe' | 'update'
  // TODO: link topic with required data type
  topic: Topics
  data: TxsTopicData | undefined
}

export class ConnectionHandler {
  public readonly coinstack: string
  public readonly id: string

  private readonly rabbit: Connection
  private readonly websocket: WebSocket
  private readonly routes: Record<Topics, Methods>
  private readonly unchainedExchange: Exchange

  private queue?: Queue

  constructor(coinstack: string, websocket: WebSocket) {
    this.coinstack = coinstack
    this.id = v4()
    this.rabbit = new Connection(BROKER_URL)
    this.unchainedExchange = this.rabbit.declareExchange('exchange.unchained', '', { noCreate: true })
    this.websocket = websocket
    this.routes = {
      txs: {
        subscribe: (data: TxsTopicData) => this.handleSubscribeTxs(data),
      },
    }
  }

  start(): void {
    this.websocket.onmessage = (event) => this.onMessage(event)
    this.websocket.onclose = () => this.onClose()
    this.websocket.onerror = () => this.onClose()
  }

  private sendError(message: string): void {
    this.websocket.send(JSON.stringify({ type: 'error', message } as ErrorResponse))
  }

  private async onMessage(event: WebSocket.MessageEvent): Promise<void> {
    try {
      const payload: RequestPayload = JSON.parse(event.data.toString())

      const callback = this.routes[payload.topic][payload.method]
      if (callback) {
        await callback(payload.data)
      } else {
        this.sendError(`route topic (${payload.topic}) method (${payload.method}) not found`)
      }
    } catch (err) {
      logger.error('onMessage error:', err)
      this.sendError('failed to handle message')
    }
  }

  private async onClose() {
    const msg: RegistryMessage = { action: 'unregister', client_id: this.id, registration: {} }
    this.unchainedExchange.send(new Message(msg), `${this.coinstack}.registry`)
    await this.queue?.delete()
  }

  private async handleSubscribeTxs(data: TxsTopicData) {
    if (this.queue) return

    if (!data.addresses?.length) {
      this.sendError('addresses required')
      return
    }

    const txExchange = this.rabbit.declareExchange(`exchange.${this.coinstack}.tx.client`, '', { noCreate: true })

    this.queue = this.rabbit.declareQueue(`queue.${this.coinstack}.tx.${this.id}`)
    this.queue.bind(txExchange, this.id)

    try {
      await this.rabbit.completeConfiguration()
    } catch (err) {
      this.queue = undefined
      logger.error('failed to complete rabbit configuration:', err)
      this.sendError('failed to complete rabbit configuration')
      return
    }

    const ingesterMeta = data.addresses.reduce<Record<string, IngesterMetadata>>((prev, address) => {
      return { ...prev, [address]: { block: data.blockNumber } }
    }, {})

    const msg: RegistryMessage = {
      action: 'register',
      client_id: this.id,
      ingester_meta: ingesterMeta,
      registration: {
        addresses: data.addresses,
      },
    }

    this.unchainedExchange.send(new Message(msg), `${this.coinstack}.registry`)

    const onMessage = (message: Message) => {
      const content = message.getContent()
      // TODO: requeue on error callback
      this.websocket.send(JSON.stringify(content))
      message.ack()
    }

    this.queue.activateConsumer(onMessage)
  }
}
