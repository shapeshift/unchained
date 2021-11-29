import { NewBlock, WebsocketRepsonse } from '@shapeshiftoss/blockbook'
import { ready, notReady, Message, MessageEvent, Socket, Subscription } from '@shapeshiftoss/common-ingester'
import { logger } from '../logger'

const INDEXER_WS_URL = process.env.INDEXER_WS_URL

if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')

const subscription: Subscription = {
  id: 'newBlk',
  jsonrpc: '2.0',
  method: 'subscribeNewBlock',
}

const msgLogger = logger.child({ namespace: ['sockets', 'newBlock'], fn: 'onMessage' })

const onMessage = (socket: Socket) => async (message: MessageEvent) => {
  try {
    const res: WebsocketRepsonse = JSON.parse(message.data.toString())

    if (!res.data) return

    if (res.id === 'ping') {
      socket.pingpong = 'pong'
    } else if ('subscribed' in res.data) {
      if (!res.data.subscribed) return
      ready()
      socket.exchange.send(new Message({ hash: '', height: -1 } as NewBlock), 'newBlock') // trigger delta sync on subscribe
    } else if ('hash' in res.data || 'height' in res.data) {
      msgLogger.debug({ height: res.data.height }, `New block`)
      socket.exchange.send(new Message(res.data), 'newBlock')
    } else {
      msgLogger.warn({ res }, 'Unhandled websocket response')
    }
  } catch (err) {
    msgLogger.error(err, 'Error processing new block')
    notReady()
  }
}

const main = async () => {
  const socket = await Socket.init(INDEXER_WS_URL, subscription, 'exchange.coinstack')

  socket.onMessage(onMessage(socket))
}

main().catch((err) => {
  logger.error(err)
  process.exit(1)
})
