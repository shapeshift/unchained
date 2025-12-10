import axios from 'axios'
import { AffiliateRevenue } from '.'

const URL = 'http://api.thorchain.localhost'

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

type Pool = {
  asset_tor_price: string
  balance_asset: string
  balance_rune: string
}

const getRunePriceUsd = async (): Promise<number> => {
  const { data } = await axios.get<Pool>(`${URL}/lcd/thorchain/pool/BTC.BTC`)

  const assetPriceUsd = Number(data.asset_tor_price) / 1e8
  const runeInAsset = Number(data.balance_asset) / Number(data.balance_rune)
  const runePriceUsd = runeInAsset * assetPriceUsd

  return runePriceUsd
}

export const getAffiliateRevenue = async (
  startTimestamp: number,
  endTimestamp: number
): Promise<Array<AffiliateRevenue>> => {
  const fees: Array<Fee> = []

  const start = startTimestamp * 1_000 // milliseconds
  const end = endTimestamp * 1_000 // milliseconds

  const { data } = await axios.get<FeesResponse>(`${URL}/api/v1/affiliate/fees`, {
    params: { source: 'shapeshift', start, end },
  })

  fees.push(...data.fees)

  const runePriceUsd = await getRunePriceUsd()

  return fees.reduce<Array<AffiliateRevenue>>((revs, fee) => {
    const chainId = 'cosmos:thorchain-1'
    const assetId = `${chainId}/slip44:931`

    revs.push({
      chainId,
      assetId,
      service: 'thorchain',
      txHash: fee.txId,
      timestamp: Math.round(fee.timestamp / 1000),
      amount: fee.amount,
      amountUsd: ((Number(fee.amount) / 1e8) * Number(runePriceUsd)).toString(),
    })

    return revs
  }, [])
}
