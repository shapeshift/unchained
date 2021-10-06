import { Blockbook } from '@shapeshiftoss/blockbook'
import { Worker, Message } from '@shapeshiftoss/common-ingester'
import { logger } from '@shapeshiftoss/logger'

const INDEXER_URL = process.env.INDEXER_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')

const blockbook = new Blockbook(INDEXER_URL)

const onMessage = (worker: Worker) => async (message: Message) => {
  const txid: string = message.getContent()

  try {
    const tx = await blockbook.getTransaction(txid)

    worker.sendMessage(new Message(tx), 'tx')
    worker.ackMessage(message, txid)
  } catch (err) {
    logger.error('onMessage.error:', err.isAxiosError ? err.message : err)
    worker.retryMessage(message, txid)
  }
}

const main = async () => {
  const worker = await Worker.init({
    queueName: 'queue.thorchain.txid',
    exchangeName: 'exchange.thorchain.tx',
  })

  worker.queue?.prefetch(100)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()
