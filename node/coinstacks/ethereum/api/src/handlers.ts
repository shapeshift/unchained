import axios from 'axios'
import axiosRetry from 'axios-retry'
import BigNumber from 'bignumber.js'
import { ethers } from 'ethers'
import { Blockbook, Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import { RPCRequest, RPCResponse } from '@shapeshiftoss/common-api'
import { EthereumTx, InternalTx } from './models'
import { NodeBlock, CallStack, EtherscanApiResponse, EtherscanInternalTx } from './types'

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

export const handleTransaction = (tx: BlockbookTx): EthereumTx => {
  if (!tx.ethereumSpecific) throw new Error(`invalid blockbook ethereum transaction: ${tx.txid}`)

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
    inputData: tx.ethereumSpecific.data,
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

export const handleTransactionWithInternalTrace = async (tx: BlockbookTx): Promise<EthereumTx> => {
  const t = handleTransaction(tx)

  // don't trace transaction if there is not input data that would potentially result in an internal transaction
  if (!t.inputData) return t

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

export const handleTransactionWithInternalEtherscan = async (tx: BlockbookTx): Promise<EthereumTx> => {
  const t = handleTransaction(tx)

  // don't trace transaction if there is not input data that would potentially result in an internal transaction
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
          from: ethers.utils.getAddress(call.from),
          to: ethers.utils.getAddress(call.to),
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
    `https://api.etherscan.io/api?module=account&action=txlistinternal&txhash=${txid}&apikey=${ETHERSCAN_API_KEY}`
  )

  if (data.status === '0') return []

  return (data.result as Array<EtherscanInternalTx>).map((t) => ({
    from: ethers.utils.getAddress(t.from),
    to: ethers.utils.getAddress(t.to),
    value: t.value,
  }))
}

export const getInternalTransactionHistoryEtherscan = async (
  address: string,
  page: number,
  pageSize: number
): Promise<Array<EtherscanInternalTx> | undefined> => {
  const { data } = await axios.get<EtherscanApiResponse>(
    `https://api.etherscan.io/api?module=account&action=txlistinternal&address=${address}&page=${page}&offset=${pageSize}&sort=desc&apikey=${ETHERSCAN_API_KEY}`
  )

  if (data.status === '0') return []

  return data.result as Array<EtherscanInternalTx>
}
