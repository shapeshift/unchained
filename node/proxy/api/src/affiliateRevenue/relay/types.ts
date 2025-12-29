export type AppFee = {
  recipient: string
  bps: string
  amount: string
  amountUsd: string
  amountUsdCurrent?: string
}

export type CurrencyObject = {
  chainId: number
  address: string
  symbol: string
  name: string
  decimals: number
}

export type InTx = {
  chainId: number
  hash: string
  timestamp: number
}

export type RequestData = {
  appFees?: AppFee[]
  paidAppFees?: AppFee[]
  feeCurrencyObject?: CurrencyObject
  inTxs?: InTx[]
  metadata?: {
    currencyIn?: {
      currency?: CurrencyObject
    }
  }
}

export type RelayRequest = {
  id: string
  status: string
  user: string
  recipient: string
  createdAt: string
  updatedAt: string
  data: RequestData
}

export type RelayResponse = {
  requests: RelayRequest[]
  continuation?: string
}
