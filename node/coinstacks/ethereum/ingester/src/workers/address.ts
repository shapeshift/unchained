import { Blockbook } from '@shapeshiftoss/blockbook'
import { Message, Worker } from '@shapeshiftoss/common-ingester'
import { ethereum, SequencedTx } from '@shapeshiftoss/unchained-client'
import { logger } from '../logger'
import { ETHSyncTx } from '../types'

const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const NETWORK = process.env.NETWORK
const RPC_URL = process.env.RPC_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!NETWORK) throw new Error('NETWORK env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })
const parser = new ethereum.TransactionParser({ rpcUrl: RPC_URL, network: NETWORK as ethereum.Network })

const msgLogger = logger.child({ namespace: ['workers', 'address'], fn: 'onMessage' })
const onMessage = (worker: Worker) => async (message: Message) => {
  const { address, txid, internalTxs, client_id, sequence, total }: ETHSyncTx = message.getContent()
  const retryKey = `${client_id}:${address}:${txid}`

  try {
    const tx = await blockbook.getTransaction(txid)
    msgLogger.trace({ blockHash: tx.blockHash, blockHeight: tx.blockHeight, txid: tx.txid }, 'Transaction')

    const parsedTx = await parser.parse(tx, address, internalTxs)

    worker.sendMessage(new Message({ ...parsedTx, sequence, total } as SequencedTx), client_id)
    worker.ackMessage(message, retryKey)

    msgLogger.debug({ address, txid, client_id }, 'Transaction published')
  } catch (err) {
    msgLogger.error(err, 'Error processing address')
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

main().catch((err) => {
  logger.error(err)
  process.exit(1)
})
