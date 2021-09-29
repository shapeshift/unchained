import { Blockbook } from '@shapeshiftoss/blockbook'
import { Message, Worker } from '@shapeshiftoss/common-ingester'
import { logger } from '@shapeshiftoss/logger'
import { parseTx } from '../parseTx'
import { ETHParseTx, ETHSyncTx } from '../types'

const INDEXER_URL = process.env.INDEXER_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')

const blockbook = new Blockbook(INDEXER_URL)

const onMessage = (worker: Worker) => async (message: Message) => {
  const { address, txid, internalTxs, document }: ETHSyncTx = message.getContent()
  const retryKey = `${address}:${txid}`

  try {
    const tx = await blockbook.getTransaction(txid)
    logger.debug(`getTransaction: ${txid}, for address: ${address}`)

    const pTx = await parseTx(tx, address, internalTxs)
    logger.info(`publishing tx: ${txid} for registered address: ${address} to client: ${document.client_id}`)
    //console.log(JSON.stringify(pTx, null, '\t'))

    worker.sendMessage(new Message({ ...pTx, document } as ETHParseTx), document.client_id)
    worker.ackMessage(message, retryKey)
  } catch (err) {
    logger.error('onMessage.error:', err.isAxiosError ? err.message : err)
    worker.retryMessage(message, retryKey)
  }
}

const main = async () => {
  const worker = await Worker.init({
    queueName: 'queue.ethereum.txid.address',
    exchangeName: 'exchange.ethereum.tx.client',
  })

  worker.queue?.prefetch(100)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()
