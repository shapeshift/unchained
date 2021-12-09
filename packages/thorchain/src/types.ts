export type Network = 'BCH' | 'BNB' | 'BTC' | 'DASH' | 'DGB' | 'DOGE' | 'ETH' | 'LTC' | 'THOR'

export type Precision = Record<Network, number>

export type ActionType = 'swap' | 'refund'

export interface TxDetails {
  input: Value
  fee: Value
  liquidityFee?: string
  output: Value
}

export interface ThorchainArgs {
  midgardUrl: string
  rpcUrl: string
  timeout?: number
}

export interface Value {
  amount: string
  asset: string
  contractAddress?: string
  network: string
}
