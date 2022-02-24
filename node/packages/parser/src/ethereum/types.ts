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

export interface YearnTokenVault {
  address: string
  symbol: string
  name: string
  display_name: string
  icon: string
  decimals: string
}
