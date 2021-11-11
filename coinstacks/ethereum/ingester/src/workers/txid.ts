import { Blockbook } from '@shapeshiftoss/blockbook'
import { Worker, Message } from '@shapeshiftoss/common-ingester'
import { logger } from '../logger'

const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })

const msgLogger = logger.child({ namespace: ['workers', 'txid'], fn: 'onMessage' })
const onMessage = (worker: Worker) => async (message: Message) => {
  const txid: string = message.getContent()

  try {
    const tx = await blockbook.getTransaction(txid)
    msgLogger.trace({ blockHash: tx.blockHash, blockHeight: tx.blockHeight, txid: tx.txid }, 'Transaction')

    worker.sendMessage(new Message(tx), 'tx')
    worker.ackMessage(message, txid)
  } catch (err) {
    msgLogger.error(err, 'Error processing txid')
    worker.retryMessage(message, txid)
  }
}

const main = async () => {
  const worker = await Worker.init({
    queueName: 'queue.txid',
    exchangeName: 'exchange.tx',
  })

  worker.queue?.prefetch(100)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()
