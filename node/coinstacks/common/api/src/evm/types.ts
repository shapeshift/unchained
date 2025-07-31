export interface Cursor {
  blockHeight?: number
  blockbookPage: number
  blockbookTxid?: string
  explorerPage: number
  explorerTxid?: string
}

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

export interface ExplorerInternalTxByHash {
  index?: number
  blockNumber: string
  timeStamp: string
  from: string
  to: string
  value: string
  contractAddress: string
  input: string
  type: string
  gas: string
  gasUsed: string
  isError: string
  errCode: string
}

export interface ExplorerInternalTxByAddress {
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
