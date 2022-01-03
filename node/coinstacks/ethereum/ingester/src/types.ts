import { SyncTx } from '@shapeshiftoss/common-ingester'
import { BlockDocument } from '@shapeshiftoss/common-mongo'

export interface ETHBlock {
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

export interface ETHSyncTx extends SyncTx {
  internalTxs?: Array<InternalTx>
}

export interface EtherscanApiResponse {
  status: string
  message: string
  result: unknown
}

export interface InternalTx {
  blockNumber: string
  timeStamp: string
  hash: string
  from: string
  to: string
  value: string
  contractAddress: string
  input: string
  type: string
  gas: string
  gasUsed: string
  traceId: string
  isError: string
  errCode: string
}

export type InternalTxHistory = Record<string, Array<InternalTx>>

export interface ReorgResult {
  dbBlock: BlockDocument
  height: number
  nodeBlock: ETHBlock
}

export type TxHistory = Array<string>
