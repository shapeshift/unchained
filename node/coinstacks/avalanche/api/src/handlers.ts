import axios from 'axios'
import axiosRetry from 'axios-retry'
import BigNumber from 'bignumber.js'
import { ethers } from 'ethers'
import { Blockbook, Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import { RPCRequest, RPCResponse } from '@shapeshiftoss/common-api'
import { AvalancheTx, InternalTx } from './models'
import { Cursor, NodeBlock, CallStack, EtherscanApiResponse, EtherscanInternalTx } from './types'

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY
const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const RPC_URL = process.env.RPC_URL

if (!ETHERSCAN_API_KEY) throw new Error('ETHERSCAN_API_KEY env var not set')
if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')

axiosRetry(axios, { retries: 5, retryDelay: axiosRetry.exponentialDelay })

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })

export const formatAddress = (address: string): string => ethers.utils.getAddress(address)

export const handleBlock = async (hash: string): Promise<Array<BlockbookTx>> => {
  const request: RPCRequest = {
    jsonrpc: '2.0',
    id: `eth_getBlockByHash-${hash}`,
    method: 'eth_getBlockByHash',
    params: [hash, false],
  }

  const { data } = await axios.post<RPCResponse>(RPC_URL, request)

  if (data.error) throw new Error(`failed to get block: ${hash}: ${data.error.message}`)
  if (!data.result) throw new Error(`failed to get block: ${hash}: ${JSON.stringify(data)}`)

  const block = data.result as NodeBlock

  // make best effort to fetch all transactions, but don't fail handling block if a single transaction fails
  const txs = await Promise.allSettled(block.transactions.map((hash) => blockbook.getTransaction(hash)))

  return (txs.filter((tx) => tx.status === 'fulfilled') as Array<PromiseFulfilledResult<BlockbookTx>>).map(
    (tx) => tx.value
  )
}

export const handleTransaction = (tx: BlockbookTx): AvalancheTx => {
  if (!tx.ethereumSpecific) throw new Error(`invalid blockbook evm transaction: ${tx.txid}`)

  const inputData = tx.ethereumSpecific.data

  return {
    txid: tx.txid,
    blockHash: tx.blockHash,
    blockHeight: tx.blockHeight,
    timestamp: tx.blockTime,
    status: tx.ethereumSpecific.status,
    from: tx.vin[0].addresses?.[0] ?? '',
    to: tx.vout[0].addresses?.[0] ?? '',
    confirmations: tx.confirmations,
    value: tx.value,
    fee: tx.fees ?? '0',
    gasLimit: tx.ethereumSpecific.gasLimit.toString(),
    gasUsed: tx.ethereumSpecific.gasUsed?.toString() ?? '0',
    gasPrice: tx.ethereumSpecific.gasPrice.toString(),
    inputData: inputData && inputData !== '0x' && inputData !== '0x0' ? inputData : undefined,
    tokenTransfers: tx.tokenTransfers?.map((tt) => ({
      contract: tt.token,
      decimals: tt.decimals,
      name: tt.name,
      symbol: tt.symbol,
      type: tt.type,
      from: tt.from,
      to: tt.to,
      value: tt.value,
    })),
  }
}

/**
 * format transaction and call debug_traceTransaction to extract internal transactions on newly confirmed transactions only.
 *
 * __not suitable for use on historical transactions when using a full node as the evm state is purged__
 */
export const handleTransactionWithInternalTrace = async (tx: BlockbookTx): Promise<AvalancheTx> => {
  const t = handleTransaction(tx)

  // don't trace pending transactions as they have no committed state to trace
  // don't trace transaction if there is not input data that would potentially result in an internal transaction
  if (t.confirmations === 0 || !t.inputData) return t

  // allow transaction to be handled even if we fail to get internal transactions (some better than none)
  const internalTxs = await (async () => {
    try {
      return await getInternalTransactionsTrace(tx.txid)
    } catch (err) {
      return undefined
    }
  })()

  t.internalTxs = internalTxs

  return t
}

export const handleTransactionWithInternalEtherscan = async (tx: BlockbookTx): Promise<AvalancheTx> => {
  const t = handleTransaction(tx)

  // don't query etherscan for internal transactions if there is no input data that would potentially result in an internal transaction
  if (!t.inputData) return t

  // allow transaction to be handled even if we fail to get internal transactions (some better than none)
  const internalTxs = await (async () => {
    try {
      return await getInternalTransactionsEtherscan(tx.txid)
    } catch (err) {
      return undefined
    }
  })()

  t.internalTxs = internalTxs

  return t
}

export const getInternalTransactionsTrace = async (txid: string): Promise<Array<InternalTx> | undefined> => {
  const request: RPCRequest = {
    jsonrpc: '2.0',
    id: `traceTransaction${txid}`,
    method: 'debug_traceTransaction',
    params: [txid, { tracer: 'callTracer' }],
  }

  const { data } = await axios.post<RPCResponse>(RPC_URL, request)

  if (data.error) throw new Error(`failed to get internalTransactions for txid: ${txid}: ${data.error.message}`)
  if (!data.result) throw new Error(`failed to get internalTransactions for txid: ${txid}`)

  const callStack = data.result as CallStack

  const processCallStack = (calls?: Array<CallStack>, txs: Array<InternalTx> = []): Array<InternalTx> | undefined => {
    if (!calls) return

    calls.forEach((call) => {
      const value = new BigNumber(call.value ?? 0)
      const gas = new BigNumber(call.gas)

      if (value.gt(0) && gas.gt(0)) {
        txs.push({
          from: formatAddress(call.from),
          to: formatAddress(call.to),
          value: value.toString(),
        })
      }

      processCallStack(call.calls, txs)
    })

    return txs.length ? txs : undefined
  }

  return processCallStack(callStack.calls)
}

export const getInternalTransactionsEtherscan = async (txid: string): Promise<Array<InternalTx> | undefined> => {
  const { data } = await axios.get<EtherscanApiResponse>(
    `https://api.snowtrace.io/api?module=account&action=txlistinternal&txhash=${txid}&apikey=${ETHERSCAN_API_KEY}`
  )

  if (data.status === '0') return []

  return (data.result as Array<EtherscanInternalTx>).map((t) => ({
    from: formatAddress(t.from),
    to: formatAddress(t.to),
    value: t.value,
  }))
}

export const getInternalTransactionHistoryEtherscan = async (
  address: string,
  page: number,
  pageSize: number
): Promise<Array<EtherscanInternalTx> | undefined> => {
  const { data } = await axios.get<EtherscanApiResponse>(
    `https://api.snowtrace.io/api?module=account&action=txlistinternal&address=${address}&page=${page}&offset=${pageSize}&sort=desc&apikey=${ETHERSCAN_API_KEY}`
  )

  if (data.status === '0') return []

  return data.result as Array<EtherscanInternalTx>
}

type InternalTxs = Map<string, { blockHeight: number; txid: string; txs: Array<InternalTx> }>

export const getEtherscanInternalTxs = async (
  address: string,
  pageSize: number,
  cursor: Cursor
): Promise<{ hasMore: boolean; internalTxs: InternalTxs }> => {
  const etherscanData = await getInternalTransactionHistoryEtherscan(address, cursor.etherscanPage, pageSize)

  const data = new Map<string, { blockHeight: number; txid: string; txs: Array<InternalTx> }>()

  if (!etherscanData?.length) return { hasMore: false, internalTxs: data }

  let doneFiltering = false
  const internalTxs = etherscanData.reduce((prev, tx) => {
    if (!doneFiltering && cursor.blockHeight && cursor.etherscanTxid) {
      // skip any transactions from blocks that we have already returned
      if (Number(tx.blockNumber) > cursor.blockHeight) return prev

      // skip any transaction that we have already returned within the same block
      // this assumes transactions are ordered in the same position within the block on every request
      if (Number(tx.blockNumber) === cursor.blockHeight) {
        if (cursor.etherscanTxid === tx.hash) {
          doneFiltering = true
        }
        return prev
      }
    }

    const iTx: InternalTx = {
      from: formatAddress(tx.from),
      to: formatAddress(tx.to),
      value: tx.value,
    }

    prev.set(tx.hash, {
      blockHeight: Number(tx.blockNumber),
      txid: tx.hash,
      txs: [...(prev.get(tx.hash)?.txs ?? []), iTx],
    })
    return prev
  }, data)

  // if no txs exist after filtering out already seen transactions, fetch the next page
  if (!internalTxs.size) {
    cursor.etherscanPage++
    return getEtherscanInternalTxs(address, pageSize, cursor)
  }

  return {
    hasMore: etherscanData.length < pageSize ? false : true,
    internalTxs,
  }
}

type BlockbookTxs = Map<string, AvalancheTx>

export const getBlockbookTxs = async (
  address: string,
  pageSize: number,
  cursor: Cursor
): Promise<{ hasMore: boolean; blockbookTxs: BlockbookTxs }> => {
  const blockbookData = await blockbook.getAddress(address, cursor.blockbookPage, pageSize, undefined, undefined, 'txs')

  const data = new Map<string, AvalancheTx>()

  if (!blockbookData?.transactions?.length || cursor.blockbookPage > (blockbookData.totalPages ?? -1)) {
    return { hasMore: false, blockbookTxs: data }
  }

  let doneFiltering = false
  let pendingTxFound: BlockbookTx | undefined
  const blockbookTxs = blockbookData.transactions.reduce((prev, tx) => {
    if (!doneFiltering && cursor.blockHeight && cursor.blockbookTxid) {
      // if the last pending tx is no longer pending, we can no longer determine confidently what we have already returned
      // consider the tx found and process the remaining txs without additional filtering
      if (cursor.blockHeight === -1 && !pendingTxFound) {
        pendingTxFound = blockbookData.transactions?.find(
          (tx) => tx.blockHeight === -1 && tx.txid === cursor.blockbookTxid
        )

        if (!pendingTxFound) {
          prev.set(tx.txid, handleTransaction(tx))
          doneFiltering = true
          return prev
        }
      }

      // skip any transactions from blocks that we have already returned (handle pending separately)
      if (cursor.blockHeight >= 0 && tx.blockHeight > cursor.blockHeight) return prev

      // skip any transaction that we have already returned within the same block
      // this assumes transactions are ordered the same (by nonce) on every request
      if (tx.blockHeight === cursor.blockHeight) {
        if (cursor.blockbookTxid === tx.txid) {
          doneFiltering = true
        }

        return prev
      }

      doneFiltering = true
    }

    prev.set(tx.txid, handleTransaction(tx))
    return prev
  }, data)

  // if no txs exist after filtering out already seen transactions, fetch the next page
  if (!blockbookTxs.size) {
    cursor.blockbookPage++
    return getBlockbookTxs(address, pageSize, cursor)
  }

  return {
    hasMore: cursor.blockbookPage < (blockbookData.totalPages ?? -1) ? true : false,
    blockbookTxs,
  }
}
