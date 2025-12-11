import axios from 'axios'
import { AffiliateRevenue } from '.'
import {
  DAO_TREASURY_ARBITRUM,
  DAO_TREASURY_AVALANCHE,
  DAO_TREASURY_BASE,
  DAO_TREASURY_BSC,
  DAO_TREASURY_ETHEREUM,
  DAO_TREASURY_GNOSIS,
  DAO_TREASURY_OPTIMISM,
  DAO_TREASURY_POLYGON,
} from './constants'

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

type Trade = {
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
}

type TradesResponse = {
  trades: Trade[]
  totalCount: number
  page: number
  limit: number
  latestTimestamp: number
}

export const getAffiliateRevenue = async (
  startTimestamp: number,
  endTimestamp: number
): Promise<Array<AffiliateRevenue>> => {
  const trades: Array<Trade> = []

  let page = 0
  let more = true
  while (more) {
    const { data } = await axios.get<TradesResponse>('https://build.portals.fi/api/dashboard/trades', {
      params: {
        from: startTimestamp,
        to: endTimestamp,
        page,
        partners: [
          DAO_TREASURY_ARBITRUM,
          DAO_TREASURY_AVALANCHE,
          DAO_TREASURY_BASE,
          DAO_TREASURY_BSC,
          DAO_TREASURY_ETHEREUM,
          DAO_TREASURY_GNOSIS,
          DAO_TREASURY_OPTIMISM,
          DAO_TREASURY_POLYGON,
        ].join(','),
      },
    })

    trades.push(...data.trades)

    if (data.trades.length < data.limit) more = false

    page++
  }

  return trades.reduce<Array<AffiliateRevenue>>((revs, trade) => {
    const token = trade.partnerFeeToken

    if (!token) return revs

    const chainId = (() => {
      switch (token.network) {
        case 'arbitrum':
          return 'eip155:42161'
        case 'avalanche':
          return 'eip155:43114'
        case 'base':
          return 'eip155:8453'
        case 'bsc':
          return 'eip155:56'
        case 'ethereum':
          return 'eip155:1'
        case 'gnosis':
          return 'eip155:100'
        case 'optimism':
          return 'eip155:10'
        case 'polygon':
          return 'eip155:137'
        default:
          throw new Error(`unsupported network: ${token.network}`)
      }
    })()

    const assetId = token.platform === 'native' ? `${chainId}/slip44:60` : `${chainId}/erc20:${token.address}`

    revs.push({
      chainId,
      assetId,
      service: 'portals',
      txHash: trade.txHash,
      timestamp: trade.timestamp,
      amount: trade.partnerFeeAmount,
      amountUsd: String(trade.partnerFeeUsd),
    })

    return revs
  }, [])
}
