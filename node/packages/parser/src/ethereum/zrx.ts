import { Tx } from '@shapeshiftoss/blockbook'
import { Dex, TradeType, TxSpecific, ZrxTx } from '../types'
import { txInteractsWithContract } from './utils'
import { GenericParser } from './index'
import { ZRX_PROXY_CONTRACT } from './constants'

export class Parser implements GenericParser {
  async parse(tx: Tx): Promise<TxSpecific<ZrxTx> | undefined> {
    if (!txInteractsWithContract(tx, ZRX_PROXY_CONTRACT)) return
    if (!(tx.tokenTransfers && tx.tokenTransfers.length)) return

    const trade = {
      dexName: Dex.Zrx,
      type: TradeType.Trade,
    }

    const data = {
      method: undefined, // TODO - add zrx ABI and decode
      parser: 'zrx',
    }

    return {
      trade,
      data,
    }
  }
}
