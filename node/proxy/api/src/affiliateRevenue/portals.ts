import axios from 'axios'
import { Fees } from '.'
import {
  DAO_TREASURY_ARBITRUM,
  DAO_TREASURY_AVALANCHE,
  DAO_TREASURY_BASE,
  DAO_TREASURY_BSC,
  DAO_TREASURY_ETHEREUM,
  DAO_TREASURY_GNOSIS,
  DAO_TREASURY_OPTIMISM,
  DAO_TREASURY_POLYGON,
  SLIP44,
} from './constants'

const NETWORK_TO_CHAIN_ID: Record<string, string> = {
  arbitrum: 'eip155:42161',
  avalanche: 'eip155:43114',
  base: 'eip155:8453',
  bsc: 'eip155:56',
  ethereum: 'eip155:1',
  gnosis: 'eip155:100',
  optimism: 'eip155:10',
  polygon: 'eip155:137',
}

const TREASURY_ADDRESSES = [
  DAO_TREASURY_ARBITRUM,
  DAO_TREASURY_AVALANCHE,
  DAO_TREASURY_BASE,
  DAO_TREASURY_BSC,
  DAO_TREASURY_ETHEREUM,
  DAO_TREASURY_GNOSIS,
  DAO_TREASURY_OPTIMISM,
  DAO_TREASURY_POLYGON,
]

type TokenDetails = {
  key: string
  name: string
  decimals: number
  symbol: string
  price: number
  address: string
  platform: string
  network: string
  image: string
  tokenId: string
}

type TradesResponse = {
  trades: Array<{
    txHash: string
    timestamp: number
    relativeTime: string
    inputToken: string
    inputTokenDetails: TokenDetails
    inputAmount: string
    inputValueUsd: number
    outputToken: string
    outputTokenDetails: TokenDetails
    outputAmount: string
    outputValueUsd: number
    broadcaster: string
    partner: string
    sender: string
    partnerFeeUsd: number
    partnerFeeAmount: string
    partnerFeeToken: TokenDetails
  }>
  totalCount: number
  page: number
  limit: number
  latestTimestamp: number
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const fees: Array<Fees> = []

  let page = 0
  let more = true
  while (more) {
    const { data } = await axios.get<TradesResponse>('https://build.portals.fi/api/dashboard/trades', {
      params: {
        from: startTimestamp,
        to: endTimestamp,
        page,
        partners: TREASURY_ADDRESSES.join(','),
      },
    })

    for (const trade of data.trades) {
      const token = trade.partnerFeeToken

      if (!token) continue

      const chainId = NETWORK_TO_CHAIN_ID[token.network]
      if (!chainId) throw new Error(`unsupported network: ${token.network}`)

      const assetId = token.platform === 'native' ? `${chainId}/slip44:${SLIP44.ETHEREUM}` : `${chainId}/erc20:${token.address}`

      fees.push({
        chainId,
        assetId,
        service: 'portals',
        txHash: trade.txHash,
        timestamp: trade.timestamp,
        amount: trade.partnerFeeAmount,
        amountUsd: String(trade.partnerFeeUsd),
      })
    }

    if (data.trades.length < data.limit) more = false

    page++
  }

  return fees
}
