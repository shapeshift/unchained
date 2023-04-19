export interface Cursor {
  blockHeight?: number
  blockbookPage: number
  blockbookTxid?: string
  explorerPage: number
  explorerTxid?: string
}

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

export interface ExplorerApiResponse<T> {
  status: string
  message: string
  result: T
}

export interface ExplorerInternalTx {
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

export interface FeeHistory {
  oldestBlock: string
  baseFeePerGas: Array<string>
  gasUsedRatio: Array<number>
  reward: Array<Array<string>>
}
