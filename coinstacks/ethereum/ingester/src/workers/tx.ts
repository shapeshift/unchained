import axios from 'axios'
import { utils } from 'ethers'
import { Blockbook, Tx } from '@shapeshiftoss/blockbook'
import { Message, Worker } from '@shapeshiftoss/common-ingester'
import { RegistryService } from '@shapeshiftoss/common-mongo'
import { logger } from '../logger'
import { ETHSyncTx, EtherscanApiResponse, InternalTx, InternalTxHistory, TxHistory } from '../types'
import { getInternalAddress } from '../parseTx'

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY
const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const MONGO_DBNAME = process.env.MONGO_DBNAME
const MONGO_URL = process.env.MONGO_URL

if (!ETHERSCAN_API_KEY) throw new Error('ETHERSCAN_API_KEY env var not set')
if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!MONGO_DBNAME) throw new Error('MONGO_DBNAME env var not set')
if (!MONGO_URL) throw new Error('MONGO_URL env var not set')

const POOL_SIZE = 100
const PAGE_SIZE = 1000
const BATCH_SIZE = 20
const SYNC_TIMEOUT = 1000 * 60 * 5

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })
const registry = new RegistryService(MONGO_URL, MONGO_DBNAME, POOL_SIZE)

const moduleLogger = logger.child({ namespace: ['workers', 'tx'] })

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

  // detect internal address for contract methods we care about (TODO: detect all internal addresses)
  if (tx.ethereumSpecific?.data) {
    const internalAddress = getInternalAddress(tx.ethereumSpecific?.data)
    internalAddress && addresses.push(internalAddress)
  }

  // normalize addresses to checksum format which matches backend and remove duplicates
  return [...new Set(addresses.map((address) => utils.getAddress(address)))]
}

const getInternalTransactions = async (
  address: string,
  page: number,
  fromHeight: number,
  toHeight?: number
): Promise<Array<InternalTx>> => {
  try {
    const { data } = await axios.get<EtherscanApiResponse>(
      `https://api.etherscan.io/api?module=account&action=txlistinternal&address=${address}&startblock=${fromHeight}&endblock=${toHeight}&page=${page}&offset=${PAGE_SIZE}&sort=desc&apikey=${ETHERSCAN_API_KEY}`
    )

    if (data.status === '0') {
      if (data.message !== 'No transactions found') {
        moduleLogger.warn({ address, page, fromHeight, toHeight, data }, 'Invalid message')
      }
      return []
    }

    return data.result as Array<InternalTx>
  } catch (err) {
    moduleLogger.error(err, 'Failed to get internal transactions')
    throw err
  }
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
        moduleLogger.debug(
          { fn: 'getTxHistory', address, fromHeight, toHeight, page: p, totalPages, duration: Date.now() - start },
          'getTxHistory'
        )
        return txids
      })
    )

    data.forEach((txids) => txids && (txHistory = txHistory.concat(txids)))
  }

  return txHistory
}

const getTxHistoryInternal = async (
  address: string,
  fromHeight: number,
  toHeight?: number
): Promise<InternalTxHistory> => {
  let page = 1
  let processing = true
  const txHistory: InternalTxHistory = {}
  while (processing) {
    const start = Date.now()
    const txs = await getInternalTransactions(address, page, fromHeight, toHeight)
    moduleLogger.debug(
      { fn: 'getTxHistoryInternal', address, fromHeight, toHeight, page, duration: Date.now() - start },
      'getTxHistoryInternal'
    )

    // only support eth internal transactions at this time
    const ethTxs = txs.filter((tx) => tx.contractAddress === '')

    // normalize addresses to checksum format which matches backend
    ethTxs.forEach((tx) => {
      const from = utils.getAddress(tx.from)
      const to = utils.getAddress(tx.to)
      txHistory[tx.hash] = [...(txHistory[tx.hash] ?? []), { ...tx, from, to }]
    })

    page++

    if (txs.length < PAGE_SIZE) processing = false
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
  const fnLogger = moduleLogger.child({ fn: 'syncAddressIfRegistered' })
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

      fnLogger.debug({ address, client_id: document.client_id, fromHeight, toHeight }, 'Sync started')

      const [txHistory, txHistoryInternal] = await Promise.all([
        getTxHistory(address, fromHeight, toHeight),
        getTxHistoryInternal(address, fromHeight, toHeight),
      ])

      const txids = [...new Set(txHistory.concat(Object.keys(txHistoryInternal)))]
      txids.forEach((txid, index) => {
        const sTx: ETHSyncTx = {
          address: address,
          sequence: index,
          total: txids.length,
          client_id: document.client_id,
          txid: txid,
          internalTxs: txHistoryInternal[txid],
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

      fnLogger.debug(
        { address, client_id: document.client_id, fromHeight, toHeight, duration: Date.now() - syncStart },
        'Sync finished'
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
    moduleLogger.error(err, { fn: 'onMessage' }, 'Error processing tx history')
    worker.retryMessage(message, tx.txid)
  }
}

const main = async () => {
  const worker = await Worker.init({
    queueName: 'queue.tx',
    exchangeName: 'exchange.txid.address',
    requeueName: 'exchange.tx',
  })

  worker.queue?.prefetch(100)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()
