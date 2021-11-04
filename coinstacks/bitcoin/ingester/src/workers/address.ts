import { Blockbook } from '@shapeshiftoss/blockbook'
import { Message, Worker, SyncTx } from '@shapeshiftoss/common-ingester'
import { logger } from '@shapeshiftoss/logger'
import { parseTx } from '../parseTx'
import { SequencedBTCParseTx } from '../types'

const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })

const onMessage = (worker: Worker) => async (message: Message) => {
  const { address, txid, client_id, sequence, total }: SyncTx = message.getContent()
  const retryKey = `${client_id}:${address}:${txid}`

  try {
    const tx = await blockbook.getTransaction(txid)
    logger.debug(`getTransaction: ${txid}, for address: ${address}`)

    const pTx = await parseTx(tx, address)
    logger.info(`publishing tx: ${txid} for registered address: ${address} to client: ${client_id}`)

    worker.sendMessage(new Message({ ...pTx, sequence, total } as SequencedBTCParseTx), client_id)
    worker.ackMessage(message, retryKey)
  } catch (err) {
    logger.error('onMessage.error:', err.isAxiosError ? err.message : err)
    worker.retryMessage(message, retryKey)
  }
}

const main = async () => {
  const worker = await Worker.init({
    queueName: 'queue.txid.address',
    exchangeName: 'exchange.tx.client',
  })

  worker.queue?.prefetch(100)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()
