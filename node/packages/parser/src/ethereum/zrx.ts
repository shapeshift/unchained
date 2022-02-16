import { Tx } from '@shapeshiftoss/blockbook'
import { Dex, TradeType, TxSpecific, ZrxTx } from '../types'
import { txInteractsWithContract } from './helpers'

export const PROXY_CONTRACT = '0xDef1C0ded9bec7F1a1670819833240f027b25EfF'

export class Parser {
  parse(tx: Tx): Partial<TxSpecific<ZrxTx>> | undefined {
    if (!txInteractsWithContract(tx, PROXY_CONTRACT)) return
    if (!(tx.tokenTransfers && tx.tokenTransfers.length)) return

    return {
      trade: {
        dexName: Dex.Zrx,
        type: TradeType.Trade,
      },
    }
  }
}
