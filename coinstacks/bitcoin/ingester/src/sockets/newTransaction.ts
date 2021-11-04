import { WebsocketRepsonse } from '@shapeshiftoss/blockbook'
import { ready, notReady, Message, MessageEvent, Socket, Subscription } from '@shapeshiftoss/common-ingester'
import { logger } from '../logger'

const INDEXER_WS_URL = process.env.INDEXER_WS_URL

if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')

const subscription: Subscription = {
  id: 'newTx',
  jsonrpc: '2.0',
  method: 'subscribeNewTransaction',
}

const socket = new Socket(INDEXER_WS_URL, subscription, 'exchange.tx')

const msgLogger = logger.child({ namespace: ['sockets'], sub: 'newTx', fn: 'onMessage' })
const onMessage = async (message: MessageEvent) => {
  try {
    const res: WebsocketRepsonse = JSON.parse(message.data.toString())

    if (!res.data) return

    if (res.id === 'ping') {
      socket.pingpong = 'pong'
    } else if ('subscribed' in res.data) {
      if (res.data.subscribed) ready()
    } else if ('txid' in res.data) {
      socket.exchange.send(new Message(res.data), 'tx')
    } else {
      msgLogger.warn({ res }, 'Unhandled websocket response')
    }
  } catch (err) {
    msgLogger.error(err, 'Error processing transaction')
    notReady()
  }
}

socket.onMessage(onMessage)
