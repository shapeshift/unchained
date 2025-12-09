import axios from 'axios'
import { AffiliateRevenue } from '.'

const API_KEY = '5db0d1cb-f3a3-4c38-9ff2-14347eb4ff84'
const URL = 'https://api.0x.org'

type Fee = {
  token?: string
  amount?: string
  amountUsd?: string
}

type Trade = {
  appName: string
  blockNumber: string
  buyToken: string
  buyAmount?: string
  chainId: number
  chainName: string
  fees: {
    integratorFee?: Fee
    zeroExFee?: Fee
  }
  gasUsed: string
  protocolVersion: '0xv4' | 'Settler'
  sellToken: string
  sellAmount?: string
  slippageBps?: string
  taker: string
  timestamp: number
  tokens: Array<{
    address: string
    symbol?: string
  }>
  transactionHash: string
  volumeUsd?: string
  zid: string
  service: 'gasless' | 'swap'
}

type TradesResponse = {
  nextCursor?: string
  trades: Array<Trade>
  zid: string
}

export const getAffiliateRevenue = async (
  startTimestamp: number,
  endTimestamp: number
): Promise<Array<AffiliateRevenue>> => {
  const trades: Array<Trade> = []

  for (const service of ['swap', 'gasless']) {
    let cursor: string | undefined

    do {
      const { data } = await axios.get<TradesResponse>(`${URL}/trade-analytics/${service}`, {
        params: { cursor, startTimestamp, endTimestamp },
        headers: {
          '0x-api-key': API_KEY,
          '0x-version': 'v2',
        },
      })

      trades.push(...data.trades)
      cursor = data.nextCursor
    } while (cursor)
  }

  return trades.reduce<Array<AffiliateRevenue>>((revs, trade) => {
    const token = trade.fees.integratorFee?.token

    if (!trade.fees.integratorFee?.amount || !token) return revs

    const chainId = `eip155:${trade.chainId}`

    const assetId = (() => {
      if (token === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') return `${chainId}/slip44:60`
      return `${chainId}/erc20:${token}`
    })()

    revs.push({
      chainId,
      assetId,
      service: 'zrx',
      txHash: trade.transactionHash,
      timestamp: trade.timestamp,
      amount: trade.fees.integratorFee.amount,
      amountUsd: trade.fees.integratorFee.amountUsd,
    })

    return revs
  }, [])
}
