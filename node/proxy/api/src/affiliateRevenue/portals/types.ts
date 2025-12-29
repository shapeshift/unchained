export type ExplorerType = 'blockscout' | 'etherscan'

export type ChainConfig = {
  chainId: string
  network: string
  router: string
  treasury: string
  explorerType: ExplorerType
  explorerUrl: string
}

export type PortalEventData = {
  txHash: string
  timestamp: number
  inputToken: string
  inputAmount: string
  outputToken: string
  outputAmount: string
}

export type TokenTransfer = {
  token: string
  amount: string
  decimals: number
  symbol: string
}

export type BlockscoutLogItem = {
  transaction_hash: string
  block_number: number
  decoded?: {
    parameters: Array<{
      name: string
      value: string
      indexed: boolean
    }>
  }
}

export type BlockscoutTransaction = {
  timestamp: string
  hash: string
}

export type BlockscoutLogsResponse = {
  items: BlockscoutLogItem[]
  next_page_params?: { block_number: number; index: number }
}

export type BlockscoutTokenTransfer = {
  from: { hash: string }
  to: { hash: string }
  token: { address_hash: string; symbol: string; decimals: string }
  total: { value: string; decimals: string }
}

export type BlockscoutTokenTransfersResponse = {
  items: BlockscoutTokenTransfer[]
}

export type EtherscanLogResult = {
  transactionHash: string
  blockNumber: string
  timeStamp: string
  topics: string[]
  data: string
}

export type EtherscanLogsResponse = {
  status: string
  message: string
  result: EtherscanLogResult[]
}

export type EtherscanTokenTxResult = {
  from: string
  to: string
  contractAddress: string
  tokenSymbol: string
  tokenDecimal: string
  value: string
}

export type EtherscanTokenTxResponse = {
  status: string
  message: string
  result: EtherscanTokenTxResult[]
}

export type DecodedPortalEvent = {
  inputToken: string
  inputAmount: string
  outputToken: string
  outputAmount: string
}
