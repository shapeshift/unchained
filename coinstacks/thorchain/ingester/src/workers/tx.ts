import { Blockbook, Tx } from '@shapeshiftoss/blockbook'
import { Message, Worker } from '@shapeshiftoss/common-ingester'
import { RegistryService } from '@shapeshiftoss/common-mongo'
import { logger } from '@shapeshiftoss/logger'
import { TxHistory } from '../types'
import { SyncTx } from '@shapeshiftoss/common-ingester'

const INDEXER_URL = process.env.INDEXER_URL
const MONGO_DBNAME = process.env.MONGO_DBNAME
const MONGO_URL = process.env.MONGO_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!MONGO_DBNAME) throw new Error('MONGO_DBNAME env var not set')
if (!MONGO_URL) throw new Error('MONGO_URL env var not set')

const POOL_SIZE = 100
const PAGE_SIZE = 1000
const BATCH_SIZE = 20
const SYNC_TIMEOUT = 1000 * 60 * 5

const blockbook = new Blockbook(INDEXER_URL)
const registry = new RegistryService(MONGO_URL, MONGO_DBNAME, POOL_SIZE)

const getPages = (from: number, to: number, max: number): Array<number> => {
  const toOrMax = to <= max ? to : max

  const pages: Array<number> = []
  for (let page = from; page <= toOrMax; page++) {
    pages.push(page)
  }

  return pages
}

const getAddresses = (tx: Tx): Array<string> => {
  const addresses: Array<string> = []

  const sendAddress = tx.vin[0]?.addresses?.[0]
  const receiveAddress = tx.vout[0]?.addresses?.[0]

  sendAddress && addresses.push(sendAddress)
  receiveAddress && addresses.push(receiveAddress)

  tx.tokenTransfers?.forEach((transfer) => {
    transfer.from && addresses.push(transfer.from)
    transfer.to && addresses.push(transfer.to)
  })

  // normalize addresses to checksum format which matches backend and remove duplicates
  return [...new Set(addresses)]
}

const getTxHistory = async (address: string, fromHeight: number, toHeight?: number): Promise<TxHistory> => {
  // totalPages is -1 when using from and to parameters, use max integer to return the closest page which would be the max page number
  const { page: totalPages = 1 } = await blockbook.getAddress(
    address,
    Number.MAX_SAFE_INTEGER,
    PAGE_SIZE,
    fromHeight,
    toHeight,
    'txids'
  )

  // concurrently process batched pages of txids
  let txHistory: TxHistory = []
  for (let page = 1; page <= totalPages; page += BATCH_SIZE) {
    const data = await Promise.all(
      getPages(page, page + BATCH_SIZE - 1, totalPages).map(async (p) => {
        const start = Date.now()
        const { txids } = await blockbook.getAddress(address, p, PAGE_SIZE, fromHeight, toHeight, 'txids')
        logger.debug(
          `getTxHistory: ${address}, from ${fromHeight} to ${toHeight}, page ${p} out of ${totalPages} (${
            Date.now() - start
          } ms)`
        )
        return txids
      })
    )

    data.forEach((txids) => txids && (txHistory = txHistory.concat(txids)))
  }

  return txHistory
}

/**
 * Get transaction history (txids) for an address from the last point synced to (fromHeight)
 * up until the height of the transaction being processed (toHeight) and publish txids to
 * the address worker.
 *
 * @returns {boolean} requeue: should transaction be requeued if address is already syncing
 */
const syncAddressIfRegistered = async (worker: Worker, tx: Tx, address: string): Promise<boolean> => {
  let requeue = false

  const documents = await registry.getByAddress(address)
  if (!documents?.length) return requeue

  const { blockHeight, confirmations, txid } = tx

  await Promise.all(
    documents.map(async (document) => {
      const metadata = document.ingester_meta?.[address]
      const fromHeight = metadata?.block ? metadata.block + 1 : 0
      const toHeight = confirmations === 0 ? undefined : blockHeight
      const syncKey = `${toHeight}:${txid}`

      // requeue transaction if we are already syncing an address to another transaction's block height and have not exceeded the sync timeout
      if (
        metadata?.syncing?.key &&
        metadata.syncing.key !== syncKey &&
        Date.now() - metadata.syncing.startTime <= SYNC_TIMEOUT
      ) {
        requeue = true
        return
      }

      const syncStart = Date.now()

      // track that we are currently syncing an address up to toHeight
      await registry.updateSyncing(address, document.client_id, syncKey)

      logger.info(
        `Address sync for: ${address} (client_id: ${document.client_id}), from: ${fromHeight}, to: ${toHeight} started`
      )

      const txHistory = await getTxHistory(address, fromHeight, toHeight)

      txHistory.forEach((txid) => {
        const sTx: SyncTx = {
          address: address,
          client_id: document.client_id,
          txid: txid,
        }
        worker.sendMessage(new Message(sTx), 'txid.address')
      })

      // use current toHeight for confirmed transaction or use the best block from the node mempool transaction (fall back to best blockbook height if node info doesn't exist for some reason)
      let block = toHeight
      if (!block) {
        const info = await blockbook.getInfo()
        block = info.backend.blocks ?? info.blockbook.bestHeight
      }

      // track that address has been fully synced up to toHeight or best block if mempool
      await registry.updateBlock(address, block, document.client_id)

      // track that we are no longer currently syncing address
      await registry.updateSyncing(address, document.client_id)

      logger.info(
        `Address sync for: ${address} (client_id: ${
          document.client_id
        }), from: ${fromHeight}, to: ${toHeight} finished (${Date.now() - syncStart} ms)`
      )
    })
  )

  return requeue
}

const onMessage = (worker: Worker) => async (message: Message) => {
  const tx: Tx = message.getContent()

  try {
    let requeue = false
    for await (const address of getAddresses(tx)) {
      if (await syncAddressIfRegistered(worker, tx, address)) {
        requeue = true
      }
    }

    if (requeue) {
      worker.requeueMessage(message, tx.txid, 'tx')
    } else {
      worker.ackMessage(message, tx.txid)
    }
  } catch (err) {
    logger.error('onMessage.error:', err.isAxiosError ? err.message : err)
    worker.retryMessage(message, tx.txid)
  }
}

const main = async () => {
  const worker = await Worker.init({
    queueName: 'queue.thorchain.tx',
    exchangeName: 'exchange.thorchain.txid.address',
    requeueName: 'exchange.thorchain.tx',
  })

  worker.queue?.prefetch(100)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()
