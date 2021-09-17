import { Blockbook } from '@shapeshiftoss/blockbook'
import { Message, Worker, SyncTx } from '@shapeshiftoss/common-ingester'
import { logger } from '@shapeshiftoss/logger'

const INDEXER_URL = process.env.INDEXER_URL
const COINSTACK = process.env.INDEXER_WS_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!COINSTACK) throw new Error('COINSTACK env var not set')

const blockbook = new Blockbook(INDEXER_URL)

const onMessage = (worker: Worker) => async (message: Message) => {
  const { address, txid, document }: SyncTx = message.getContent()
  const retryKey = `${address}:${txid}`

  try {
    const tx = await blockbook.getTransaction(txid)
    logger.debug(`getTransaction: ${txid}, for address: ${address}`)
    logger.info(`publishing tx: ${txid} for registered address: ${address} to client: ${document.client_id}`)

    worker.sendMessage(new Message({ ...tx, document }), document.client_id)
    worker.ackMessage(message, retryKey)
  } catch (err) {
    logger.error('onMessage.error:', err.isAxiosError ? err.message : err)
    worker.retryMessage(message, retryKey)
  }
}

const main = async () => {
  const worker = await Worker.init({
    queueName: `queue.${COINSTACK}.txid.address`,
    exchangeName: `exchange.${COINSTACK}.tx.client`,
  })

  worker.queue?.prefetch(100)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()
