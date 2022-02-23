import { Tx } from '@shapeshiftoss/blockbook'
import { TxSpecific, YearnTx } from '../types'
import shapeShiftRouter from './abi/shapeShiftRouter'
import yearnVault from './abi/yearnVault'
import { GenericParser } from './index'
import { ethers } from 'ethers'
import { SHAPE_SHIFT_ROUTER_CONTRACT } from './constants'

export class Parser implements GenericParser {
  supportsTransaction(tx: Tx) {
    const data = tx.ethereumSpecific?.data
    const firstVoutAddress = tx.vout && tx.vout[0].addresses && tx.vout[0].addresses[0]
    const contractData = data?.slice(0, 2).concat(data?.slice(34, 74)).toLowerCase()

    if (firstVoutAddress === SHAPE_SHIFT_ROUTER_CONTRACT) return true
    if (contractData === SHAPE_SHIFT_ROUTER_CONTRACT.toLowerCase()) return true

    return false
  }

  async parse(tx: Tx): Promise<TxSpecific<YearnTx> | undefined> {
    if (!this.supportsTransaction(tx)) return

    const abiInterface = new ethers.utils.Interface([...shapeShiftRouter, ...yearnVault])

    const data = tx.ethereumSpecific?.data
    const decoded = data ? abiInterface.parseTransaction({ data }) : undefined
    console.log('result', decoded?.name)

    return {
      data: {
        type: decoded?.name,
      },
    }
  }
}
