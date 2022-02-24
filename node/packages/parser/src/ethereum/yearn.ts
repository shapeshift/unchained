import { Tx } from '@shapeshiftoss/blockbook'
import { GenericParser, TxSpecific, YearnTx } from '../types'
import shapeShiftRouter from './abi/shapeShiftRouter'
import yearnVault from './abi/yearnVault'
import { ethers } from 'ethers'
import { SHAPE_SHIFT_ROUTER_CONTRACT } from './constants'
import { getSigHash, getYearnTokenVaultAddresses } from './utils'

export class Parser implements GenericParser {
  yearnTokenVaultAddresses: Array<string> | undefined

  async parse(tx: Tx): Promise<TxSpecific<YearnTx> | undefined> {
    const data = tx.ethereumSpecific?.data
    if (!data) return

    const abiInterface = this.getAbiInterface(data)
    const decoded = abiInterface?.parseTransaction({ data })
    const spender = decoded?.args._spender
    const receiveAddress = tx.vout?.[0].addresses?.[0]

    if (!this.yearnTokenVaultAddresses) {
      this.yearnTokenVaultAddresses = await getYearnTokenVaultAddresses()
    }

    if (
      !(
        [receiveAddress, spender].includes(SHAPE_SHIFT_ROUTER_CONTRACT) ||
        (receiveAddress ? this.yearnTokenVaultAddresses?.includes(receiveAddress) : false)
      )
    )
      return

    return {
      data: {
        method: decoded?.name,
        parser: 'yearn',
      },
    }
  }

  getAbiInterface(data: string): ethers.utils.Interface | undefined {
    const shapeShiftInterface = new ethers.utils.Interface(shapeShiftRouter)
    const yearnInterface = new ethers.utils.Interface(yearnVault)

    const txSigHash = getSigHash(data)
    const approvalSigHash = yearnInterface.getSighash('approve')
    // TODO - work out how to use shapeShiftInterface.getSighash('deposit(address,address,uint256,uint256)')
    const depositSigHash = '0x20e8c565'
    // TODO - work out how to use yearnInterface.getSighash('withdraw(...)')
    const withdrawSigHash = '0x00f714ce'

    return (() => {
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
  }
}
