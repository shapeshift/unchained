import { Blockbook } from '@shapeshiftoss/blockbook'
import { Message, Worker } from '@shapeshiftoss/common-ingester'
import { logger } from '@shapeshiftoss/logger'
import { parseTx } from '../parseTx'
import { ETHSyncTx, SequencedETHParseTx } from '../types'

const INDEXER_URL = process.env.INDEXER_URL
const NETWORK = process.env.NETWORK

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!NETWORK) throw new Error('NETWORK env var not set')

const asset = NETWORK !== 'mainnet' ? `ethereum-${NETWORK}` : 'ethereum'
const blockbook = new Blockbook(INDEXER_URL)

const onMessage = (worker: Worker) => async (message: Message) => {
  const { address, txid, internalTxs, client_id, sequence, total }: ETHSyncTx = message.getContent()
  const retryKey = `${client_id}:${address}:${txid}`

  try {
    const tx = await blockbook.getTransaction(txid)
    logger.debug(`getTransaction: ${txid}, for address: ${address}`)

    const pTx = await parseTx(tx, address, internalTxs)
    logger.info(`publishing tx: ${txid} for registered address: ${address} to client: ${client_id}`)

    worker.sendMessage(new Message({ ...pTx, sequence, total } as SequencedETHParseTx), client_id)
    worker.ackMessage(message, retryKey)
  } catch (err) {
    logger.error('onMessage.error:', err.isAxiosError ? err.message : err)
    worker.retryMessage(message, retryKey)
  }
}

const main = async () => {
  const worker = await Worker.init({
    queueName: `queue.${asset}.txid.address`,
    exchangeName: `exchange.${asset}.tx.client`,
  })

  worker.queue?.prefetch(100)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()
