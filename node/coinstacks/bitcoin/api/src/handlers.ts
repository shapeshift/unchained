import axios from 'axios'
import axiosRetry from 'axios-retry'
import { Blockbook, Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import { RPCRequest, RPCResponse } from '@shapeshiftoss/common-api'
import { BitcoinTx } from './models'

const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const RPC_URL = process.env.RPC_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')

axiosRetry(axios, { retries: 5, retryDelay: axiosRetry.exponentialDelay })

export interface NodeBlock {
  hash: string
  confirmations: number
  size: number
  strippedsize: number
  weight: number
  height: number
  version: number
  versionHex: string
  merkleroot: string
  tx: Array<string>
  time: number
  mediantime: number
  nonce: number
  bits: string
  difficulty: number
  chainwork: string
  nTx: number
  previousblockhash: string
  nextblockhash: string
}

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })

export const handleBlock = async (hash: string): Promise<Array<BlockbookTx>> => {
  const request: RPCRequest = {
    jsonrpc: '2.0',
    id: `getblock-${hash}`,
    method: 'getblock',
    params: [hash],
  }

  const { data } = await axios.post<RPCResponse>(RPC_URL, request)

  if (data.error) throw new Error(`failed to get block: ${hash}: ${data.error.message}`)
  if (!data.result) throw new Error(`failed to get block: ${hash}: ${JSON.stringify(data)}`)

  const block = data.result as NodeBlock

  // make best effort to fetch all transactions, but don't fail handling block if a single transaction fails
  const txs = await Promise.allSettled(block.tx.map((hash) => blockbook.getTransaction(hash)))

  return (txs.filter((tx) => tx.status === 'fulfilled') as Array<PromiseFulfilledResult<BlockbookTx>>).map(
    (tx) => tx.value
  )
}

export const handleTransaction = (tx: BlockbookTx): BitcoinTx => ({
  txid: tx.txid,
  blockHash: tx.blockHash,
  blockHeight: tx.blockHeight,
  timestamp: tx.blockTime,
  confirmations: tx.confirmations,
  value: tx.value,
  fee: tx.fees ?? '0',
  hex: tx.hex ?? '',
  vin: tx.vin.map((vin) => ({
    txid: vin.txid,
    vout: vin.vout?.toString(),
    sequence: vin.sequence,
    coinbase: vin.coinbase,
    ...(vin.hex && {
      scriptSig: {
        hex: vin.hex,
      },
    }),
    addresses: vin.addresses,
    value: vin.value,
  })),
  vout: tx.vout.map((vout) => ({
    value: vout.value ?? '0',
    n: vout.n,
    ...(!vout.isAddress &&
      vout.addresses &&
      vout.addresses[0].includes('OP_RETURN') && {
        opReturn: vout.addresses[0],
      }),
    scriptPubKey: {
      hex: vout.hex,
    },
    ...(vout.isAddress && {
      addresses: vout.addresses ?? undefined,
    }),
  })),
})
