import axios from 'axios'
import { Fees } from '.'
import { NATIVE_TOKEN_ADDRESS } from './constants'

const ZRX_API_KEY = process.env.ZRX_API_KEY

if (!ZRX_API_KEY) throw new Error('ZRX_API_KEY env var not set')

type Fee = {
  token?: string
  amount?: string
  amountUsd?: string
}

type TradesResponse = {
  nextCursor?: string
  trades: Array<{
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
  }>
  zid: string
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const fees: Array<Fees> = []

  for (const service of ['swap', 'gasless']) {
    let cursor: string | undefined

    do {
      const { data } = await axios.get<TradesResponse>(`https://api.0x.org/trade-analytics/${service}`, {
        params: { cursor, startTimestamp, endTimestamp },
        headers: {
          '0x-api-key': ZRX_API_KEY,
          '0x-version': 'v2',
        },
      })

      for (const trade of data.trades) {
        const token = trade.fees.integratorFee?.token

        if (!trade.fees.integratorFee?.amount || !token) continue

        const chainId = `eip155:${trade.chainId}`
        const assetId =
          token.toLowerCase() === NATIVE_TOKEN_ADDRESS ? `${chainId}/slip44:60` : `${chainId}/erc20:${token}`

        fees.push({
          chainId,
          assetId,
          service: 'zrx',
          txHash: trade.transactionHash,
          timestamp: trade.timestamp,
          amount: trade.fees.integratorFee.amount,
          amountUsd: trade.fees.integratorFee.amountUsd,
        })
      }

      cursor = data.nextCursor
    } while (cursor)
  }

  return fees
}
