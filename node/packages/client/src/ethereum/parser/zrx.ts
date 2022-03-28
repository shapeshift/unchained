import { Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import { Dex, TradeType } from '../../types'
import { TxSpecific, SubParser } from '../types'
import { txInteractsWithContract } from './utils'
import { ZRX_PROXY_CONTRACT } from './constants'

export class Parser implements SubParser {
  async parse(tx: BlockbookTx): Promise<TxSpecific | undefined> {
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
