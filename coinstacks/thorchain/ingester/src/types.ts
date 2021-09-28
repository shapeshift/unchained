import { Tx } from '@shapeshiftoss/blockbook'
import { ParseTx } from '@shapeshiftoss/common-ingester'
import { BlockDocument } from '@shapeshiftoss/common-mongo'

export interface THORBlock {
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

export type THORParseTx = Tx & ParseTx

export interface ReorgResult {
  dbBlock: BlockDocument
  height: number
  nodeBlock: THORBlock
}

export type TxHistory = Array<string>
