import { Tx } from '@shapeshiftoss/blockbook'
import { ParseTxUnique, Trade } from '@shapeshiftoss/common-ingester'
import { InternalTx } from '../types'
import { aggregateBuy, aggregateSell } from './utils'

export const PROXY_CONTRACT = '0xDef1C0ded9bec7F1a1670819833240f027b25EfF'

export const parse = (tx: Tx, address: string, internalTxs?: Array<InternalTx>): ParseTxUnique | undefined => {
  if (!tx.tokenTransfers || tx.tokenTransfers.length <= 1) return

  const trade: Trade = {
    dexName: 'zrx',
    feeAsset: 'ETH',
    feeAmount: tx.fees ?? '0',
    ...aggregateSell(tx, address, internalTxs),
    ...aggregateBuy(tx, address, internalTxs),
  }

  return { trade }
}
