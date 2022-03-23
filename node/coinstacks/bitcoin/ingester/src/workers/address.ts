import { Blockbook } from '@shapeshiftoss/blockbook'
import { Message, Worker, SyncTx } from '@shapeshiftoss/common-ingester'
import { bitcoin } from '@shapeshiftoss/unchained-client'
import { logger } from '../logger'

const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const NETWORK = process.env.NETWORK
const RPC_URL = process.env.RPC_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!NETWORK) throw new Error('NETWORK env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })
const parser = new bitcoin.TransactionParser({
  rpcUrl: RPC_URL,
  network: NETWORK as bitcoin.Network,
})

const msgLogger = logger.child({ namespace: ['workers', 'address'], fn: 'onMessage' })
const onMessage = (worker: Worker) => async (message: Message) => {
  const { address, txid, client_id }: SyncTx = message.getContent()
  const retryKey = `${client_id}:${address}:${txid}`

  try {
    const tx = await blockbook.getTransaction(txid)
    msgLogger.trace({ blockHash: tx.blockHash, blockHeight: tx.blockHeight, txid: tx.txid }, 'Transaction')

    const parsedTx = await parser.parse(tx, address)

    worker.sendMessage(new Message(parsedTx), client_id)
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
