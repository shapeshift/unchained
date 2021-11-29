import { Tx } from '@shapeshiftoss/blockbook'
import { Dex, Tx as ParseTx, TradeType } from '../types'

export const PROXY_CONTRACT = '0xDef1C0ded9bec7F1a1670819833240f027b25EfF'

export class Parser {
  parse(tx: Tx): Partial<ParseTx> | undefined {
    if (!tx.tokenTransfers || tx.tokenTransfers.length <= 1) return

    return {
      trade: {
        dexName: Dex.Zrx,
        type: TradeType.Trade,
      },
    }
  }
}
