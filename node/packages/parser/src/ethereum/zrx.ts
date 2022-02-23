import { Tx } from '@shapeshiftoss/blockbook'
import { Dex, TradeType, TxSpecific, ZrxTx } from '../types'
import { txInteractsWithContract } from './utils'
import { GenericParser } from './index'

export const PROXY_CONTRACT = '0xDef1C0ded9bec7F1a1670819833240f027b25EfF'

export class Parser implements GenericParser {
  async parse(tx: Tx): Promise<TxSpecific<ZrxTx> | undefined> {
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
