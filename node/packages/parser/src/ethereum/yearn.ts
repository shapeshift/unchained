import { Tx } from '@shapeshiftoss/blockbook'
import { TxSpecific, YearnTx } from '../types'
import shapeShiftRouter from './abi/shapeShiftRouter'
import yearnVault from './abi/yearnVault'
import { GenericParser } from './index'
import { ethers } from 'ethers'
import { SHAPE_SHIFT_ROUTER_CONTRACT } from './constants'
import { getSigHash } from './utils'

export class Parser implements GenericParser {
  async parse(tx: Tx): Promise<TxSpecific<YearnTx> | undefined> {
    const shapeShiftInterface = new ethers.utils.Interface(shapeShiftRouter)
    const yearnInterface = new ethers.utils.Interface(yearnVault)

    const data = tx.ethereumSpecific?.data
    if (!data) return

    const txSigHash = getSigHash(data)
    const approvalSigHash = yearnInterface.getSighash('approve')
    const depositSigHash = '0x20e8c565' // We hardcode this as there are 2 'deposit' functions in shapeShiftRouter

    const abiInterface = (() => {
      switch (txSigHash) {
        case approvalSigHash:
          return yearnInterface
        case depositSigHash:
          return shapeShiftInterface
        default:
          return undefined
      }
    })()

    const decoded = abiInterface?.parseTransaction({ data })
    const spender = decoded?.args._spender
    const receiveAddress = tx.vout?.[0].addresses?.[0]

    if (![receiveAddress, spender].includes(SHAPE_SHIFT_ROUTER_CONTRACT)) return

    return {
      data: {
        type: decoded?.name,
      },
    }
  }
}
