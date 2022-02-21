import { Tx, Blockbook } from '@shapeshiftoss/blockbook'
import { YearnTx, TxSpecific as ParseTxSpecific } from '../types'
import shapeShiftRouter from './abi/shapeShiftRouter'
import { addABI, decodeMethod } from 'abi-decoder'

const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL

export class Parser {
  blockbook: Blockbook

  constructor() {
    if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
    if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')

    this.blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })
  }

  async parse(tx: Tx): Promise<ParseTxSpecific<YearnTx> | undefined> {
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
