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

// action: {
//   callType: 'call',
//   from: '0xd7f1dd5d49206349cae8b585fcb0ce3d96f1696f',
//   gas: '0xcb07',
//   input: '0xa9059cbb0000000000000000000000003728eca61872179220b806cb8c819ed6eefeb42500000000000000000000000000000000000000000000000000000000000003e2',
//   to: '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83',
//   value: '0x0'
// },
// blockHash: '0x1946bbe1192c9af842a15871d18da5ef510ae19636bb2a7143e79e5f5d2d6642',
// blockNumber: 28254455,
// result: {
//   gasUsed: '0x25f3',
//   output: '0x0000000000000000000000000000000000000000000000000000000000000001'
// },
// subtraces: 1,
// traceAddress: [ 4 ],
// transactionHash: '0x7a418a4567e3d9a97aa8c7a93c8daa988b85cd12a174db94811cbf3dd1e660a4',
// transactionPosition: 1,
// type: 'call'
// },

export interface TraceCall {
  action: {
    callType: string
    from: string
    gas: string
    input: string
    to: string
    value: string
  }
  blockHash: string
  blockNumber: number
  result: {
    gasUsed: string
    output: string
  }
  subtraces: number
  traceAddress: Array<number>
  transactionHash: string
  transactionPosition: number
  type: string
}

export interface DebugCallStack {
  type: string
  from: string
  to: string
  value?: string
  gas: string
  gasUsed: string
  input: string
  output: string
  calls?: Array<DebugCallStack>
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
