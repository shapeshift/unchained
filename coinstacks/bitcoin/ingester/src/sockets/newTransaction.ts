import { WebsocketRepsonse } from '@shapeshiftoss/blockbook'
import { ready, notReady, Message, MessageEvent, Socket, Subscription } from '@shapeshiftoss/common-ingester'
import { logger } from '@shapeshiftoss/logger'

const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const COINSTACK = process.env.COINSTACK

if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!COINSTACK) throw new Error('COINSTACK env var not set')

const subscription: Subscription = {
  id: 'newTx',
  jsonrpc: '2.0',
  method: 'subscribeNewTransaction',
}

const socket = new Socket(INDEXER_WS_URL, subscription, `exchange.${COINSTACK}.tx`)

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
      logger.warn('unhandled websocket response:', res)
    }
  } catch (err) {
    logger.error('socket.onmessage error:', err)
    notReady()
  }
}

socket.onMessage(onMessage)
