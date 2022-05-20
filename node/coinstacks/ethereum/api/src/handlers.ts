import axios from 'axios'
import axiosRetry from 'axios-retry'
import BigNumber from 'bignumber.js'
import { ethers } from 'ethers'
import { Blockbook, Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import { RPCRequest, RPCResponse } from '@shapeshiftoss/common-api'
import { EthereumTx, InternalTx } from './models'

const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const RPC_URL = process.env.RPC_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')

axiosRetry(axios, { retries: 5, retryDelay: axiosRetry.exponentialDelay })

export interface NodeBlock {
  difficulty: string
  extraData: string
  gasLimit: string
  gasUsed: string
  hash: string
  logsBloom: string
  miner: string
  mixHash: string
  nonce: string
  number: string
  parentHash: string
  receiptsRoot: string
  sha3Uncles: string
  size: string
  stateRoot: string
  timestamp: string
  totalDifficulty: string
  transactions: Array<string>
  transactionsRoot: string
  uncles: Array<string>
}

export interface CallStack {
  type: string
  from: string
  to: string
  value?: string
  gas: string
  gasUsed: string
  input: string
  output: string
  calls?: Array<CallStack>
}

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })

export const handleBlock = async (hash: string): Promise<any> => {
  const request: RPCRequest = {
    jsonrpc: '2.0',
    id: `getBlock${hash}`,
    method: 'eth_getBlockByHash',
    params: [hash, false],
  }

  const { data } = await axios.post<RPCResponse>(RPC_URL, request)

  if (data.error) throw new Error(`failed to get block: ${hash}: ${data.error.message}`)
  if (!data.result) throw new Error(`failed to get block: ${hash}: ${JSON.stringify(data)}`)

  const block = data.result as NodeBlock

  const txs = await Promise.all(block.transactions.map((hash) => blockbook.getTransaction(hash)))

  return txs
}

export const handleTransaction = async (tx: BlockbookTx): Promise<EthereumTx> => {
  if (!tx.ethereumSpecific) throw new Error(`invalid blockbook ethereum transaction: ${tx.txid}`)

  // allow transaction to be handled even if we fail to get internal transactions (some better than none)
  const internalTxs = async () => {
    try {
      return await getInternalTransactions(tx.txid)
    } catch (err) {
      return undefined
    }
  }

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
    ...(tx.ethereumSpecific.data &&
      tx.confirmations > 0 && {
        internalTxs: await internalTxs(),
      }),
  }
}

export const getInternalTransactions = async (txid: string): Promise<Array<InternalTx> | undefined> => {
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
