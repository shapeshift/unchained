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

const getCacaoPriceUsd = async (): Promise<number> => {
  const { data } = await axios.get<{ cacao: { usd: string } }>(
    'https://api.proxy.shapeshift.com/api/v1/markets/simple/price',
    {
      params: {
        vs_currencies: 'usd',
        ids: 'cacao',
      },
    }
  )

  return Number(data.cacao.usd)
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const revenues: Array<Fees> = []

  const start = startTimestamp * 1_000 // milliseconds
  const end = endTimestamp * 1_000 // milliseconds

  const { data } = await axios.get<FeesResponse>('https://dev-api.mayachain.shapeshift.com/api/v1/affiliate/fees', {
    params: { start, end },
  })

  const cacaoPriceUsd = await getCacaoPriceUsd()

  const chainId = 'cosmos:mayachain-mainnet-v1'
  const assetId = `${chainId}/slip44:931`

  for (const fee of data.fees) {
    revenues.push({
      chainId,
      assetId,
      service: 'mayachain',
      txHash: fee.txId,
      timestamp: Math.round(fee.timestamp / 1000),
      amount: fee.amount,
      amountUsd: ((Number(fee.amount) / 1e8) * cacaoPriceUsd).toString(),
    })
  }

  return revenues
}
