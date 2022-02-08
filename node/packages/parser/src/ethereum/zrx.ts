import { Tx } from '@shapeshiftoss/blockbook'
import { Dex, TradeType, Tx as ParseTx } from '../types'
import { txMatchesContract } from './helpers'

export const PROXY_CONTRACT = '0xDef1C0ded9bec7F1a1670819833240f027b25EfF'

export class Parser {
  isSupportedTransaction(tx: Tx) {
    const isZrxContract = txMatchesContract(tx, PROXY_CONTRACT)
    const hasTokenTransfers = tx.tokenTransfers && tx.tokenTransfers.length
    return isZrxContract && hasTokenTransfers
  }

  parse(tx: Tx): Partial<ParseTx> | undefined {
    if (!this.isSupportedTransaction(tx)) return

    return {
      trade: {
        dexName: Dex.Zrx,
        type: TradeType.Trade,
      },
    }
  }
}
