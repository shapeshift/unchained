import axios from 'axios'
import { Fees } from '.'

type FeesResponse = {
  fees: Array<{
    address: string
    amount: string
    asset: string
    blockHash: string
    blockHeight: number
    timestamp: number
    txId: string
  }>
}

const getRunePriceUsd = async (): Promise<number> => {
  const { data } = await axios.get<{ thorchain: { usd: string } }>(
    'https://api.proxy.shapeshift.com/api/v1/markets/simple/price',
    {
      params: {
        vs_currencies: 'usd',
        ids: 'thorchain',
      },
    }
  )

  return Number(data.thorchain.usd)
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const fees: Array<Fees> = []

  const start = startTimestamp * 1_000 // milliseconds
  const end = endTimestamp * 1_000 // milliseconds

  const { data } = await axios.get<FeesResponse>('https://api.thorchain.shapeshift.com/api/v1/affiliate/fees', {
    params: { start, end },
  })

  const runePriceUsd = await getRunePriceUsd()

  const chainId = 'cosmos:thorchain-1'
  const assetId = `${chainId}/slip44:931`

  for (const fee of data.fees) {
    fees.push({
      chainId,
      assetId,
      service: 'thorchain',
      txHash: fee.txId,
      timestamp: Math.round(fee.timestamp / 1000),
      amount: fee.amount,
      amountUsd: ((Number(fee.amount) / 1e8) * runePriceUsd).toString(),
    })
  }

  return fees
}
