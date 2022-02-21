import { Tx } from '@shapeshiftoss/blockbook'
import { TxSpecific as ParseTxSpecific, YearnTx } from '../types'
import shapeShiftRouter from './abi/shapeShiftRouter'
import yearnVault from './abi/yearnVault'
import { addABI, decodeMethod } from 'abi-decoder'
import { GenericParser } from './index'

const ROUTER_CONTRACT = '0x6a1e73f12018D8e5f966ce794aa2921941feB17E'

export class Parser implements GenericParser {
  supportsTransaction(tx: Tx) {
    const data = tx.ethereumSpecific?.data
    const firstVoutAddress = tx.vout && tx.vout[0].addresses && tx.vout[0].addresses[0]
    const contractData = data?.slice(0, 2).concat(data?.slice(34, 74)).toLowerCase()

    if (firstVoutAddress === ROUTER_CONTRACT) return true
    if (contractData === ROUTER_CONTRACT.toLowerCase()) return true

    return false
  }

  async parse(tx: Tx): Promise<ParseTxSpecific<YearnTx> | undefined> {
    if (!this.supportsTransaction(tx)) return
    addABI([...shapeShiftRouter, ...yearnVault])

    const decoded = (tx.ethereumSpecific?.data && decodeMethod(tx.ethereumSpecific.data)) || { name: '', params: [] }
    return {
      data: {
        type: decoded.name,
      },
    }
  }
}
