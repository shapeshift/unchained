import { Blockbook, Tx } from '@shapeshiftoss/blockbook'
import { TxSpecific as ParseTxSpecific, YearnTx } from '../types'
import shapeShiftRouter from './abi/shapeShiftRouter'
import { addABI, decodeMethod } from 'abi-decoder'
import { GenericParser } from './index'

const ROUTER_CONTRACT = '0x6a1e73f12018D8e5f966ce794aa2921941feB17E'

export interface ParserArgs {
  blockbook: Blockbook
}

export class Parser implements GenericParser {
  blockbook: Blockbook

  constructor(args: ParserArgs) {
    this.blockbook = args.blockbook
  }

  async parse(tx: Tx): Promise<ParseTxSpecific<YearnTx> | undefined> {
    const interactedWith = tx.vout && tx.vout[0].addresses && tx.vout[0].addresses[0]
    if (interactedWith !== ROUTER_CONTRACT) return

    const transaction = await this.blockbook.getTransaction(tx.txid)
    const data = transaction.ethereumSpecific?.data
    addABI(shapeShiftRouter)

    const decoded = (data && decodeMethod(data)) || { name: '', params: [] }
    return {
      data: {
        type: decoded.name,
      },
    }
  }
}
