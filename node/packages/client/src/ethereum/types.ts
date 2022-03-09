import { StandardTx, TxMetadata } from '../types'

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

export type Network = 'mainnet' | 'ropsten'

export interface UniV2Tx extends StandardTx {
  data?: TxMetadata // TODO = Type and extend any specific properties
}

export interface ZrxTx extends StandardTx {
  data?: TxMetadata // TODO = Type and extend any specific properties
}

export interface ThorTx extends StandardTx {
  data?: TxMetadata // TODO = Type and extend any specific properties
}

export interface YearnTx extends StandardTx {
  data?: TxMetadata // TODO = Type and extend any specific properties
}
