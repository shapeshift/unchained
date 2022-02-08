import { Tx } from '@shapeshiftoss/blockbook'
import { Dex, TradeType, Tx as ParseTx } from '../types'
import { txInteractsWithContract } from './helpers'

export const PROXY_CONTRACT = '0xDef1C0ded9bec7F1a1670819833240f027b25EfF'

export class Parser {
  isParsable(tx: Tx): boolean {
    if (!txInteractsWithContract(tx, PROXY_CONTRACT)) return false
    if (!(tx.tokenTransfers && tx.tokenTransfers.length)) return false

    return true
  }

  parse(tx: Tx): Partial<ParseTx> | undefined {
    if (!this.isParsable(tx)) return

    return {
      trade: {
        dexName: Dex.Zrx,
        type: TradeType.Trade,
      },
    }
  }
}
