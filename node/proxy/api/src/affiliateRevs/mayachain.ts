import axios from 'axios'
import { AffiliateRevenue } from '.'

const URL = 'https://dev-api.mayachain.shapeshift.com'

type Fee = {
  address: string
  amount: string
  asset: string
  blockHash: string
  blockHeight: number
  timestamp: number
  txId: string
}

type FeesResponse = {
  fees: Fee[]
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

export const getAffiliateRevenue = async (
  startTimestamp: number,
  endTimestamp: number
): Promise<Array<AffiliateRevenue>> => {
  const fees: Array<Fee> = []

  const start = startTimestamp * 1_000 // milliseconds
  const end = endTimestamp * 1_000 // milliseconds

  const { data } = await axios.get<FeesResponse>(`${URL}/api/v1/affiliate/fees`, {
    params: { start, end },
  })

  fees.push(...data.fees)

  const cacaoPriceUsd = await getCacaoPriceUsd()

  return fees.reduce<Array<AffiliateRevenue>>((revs, fee) => {
    const chainId = 'cosmos:mayachain-mainnet-v1'
    const assetId = `${chainId}/slip44:931`

    revs.push({
      chainId,
      assetId,
      service: 'mayachain',
      txHash: fee.txId,
      timestamp: Math.round(fee.timestamp / 1000),
      amount: fee.amount,
      amountUsd: ((Number(fee.amount) / 1e8) * Number(cacaoPriceUsd)).toString(),
    })

    return revs
  }, [])
}
