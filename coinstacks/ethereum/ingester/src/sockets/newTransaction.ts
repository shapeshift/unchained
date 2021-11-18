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

const msgLogger = logger.child({ namespace: ['sockets', 'newTransaction'], fn: 'onMessage' })

const onMessage = (socket: Socket) => async (message: MessageEvent) => {
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

const main = async () => {
  const socket = await Socket.init(INDEXER_WS_URL, subscription, 'exchange.tx')

  socket.onMessage(onMessage(socket))
}

main().catch((err) => {
  logger.error(err)
  process.exit(1)
})
