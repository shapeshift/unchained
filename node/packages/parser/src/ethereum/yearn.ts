import { Tx } from '@shapeshiftoss/blockbook'
import { TxSpecific, YearnTx } from '../types'
import shapeShiftRouter from './abi/shapeShiftRouter'
import yearnVault from './abi/yearnVault'
import { GenericParser } from './index'
import { ethers } from 'ethers'
import { SHAPE_SHIFT_ROUTER_CONTRACT, YEARN_LINK_TOKEN_VAULT } from './constants'
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
    const withdrawSigHash = '0x00f714ce' // We hardcode this as there are multiple 'withdraw' functions in shapeShiftRouter

    const abiInterface = (() => {
      switch (txSigHash) {
        case approvalSigHash:
          return yearnInterface
        case depositSigHash:
          return shapeShiftInterface
        case withdrawSigHash:
          return yearnInterface
        default:
          return undefined
      }
    })()

    const decoded = abiInterface?.parseTransaction({ data })
    const spender = decoded?.args._spender
    const receiveAddress = tx.vout?.[0].addresses?.[0]

    // FIXME - for withdraw, it only detects yvLINK withdrawal - find a way to make this generic for all Yearn vaults
    if (!([receiveAddress, spender].includes(SHAPE_SHIFT_ROUTER_CONTRACT) || receiveAddress === YEARN_LINK_TOKEN_VAULT))
      return

    return {
      data: {
        type: decoded?.name,
      },
    }
  }
}
