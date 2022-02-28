import { Tx } from '@shapeshiftoss/blockbook'
import { GenericParser, TxSpecific, YearnTx } from '../types'
import shapeShiftRouter from './abi/shapeShiftRouter'
import yearnVault from './abi/yearnVault'
import { ethers } from 'ethers'
import { SHAPE_SHIFT_ROUTER_CONTRACT } from './constants'
import { getSigHash, getYearnTokenVaultAddresses } from './utils'

interface ParserArgs {
  provider: ethers.providers.JsonRpcProvider
}

export class Parser implements GenericParser {
  provider: ethers.providers.JsonRpcProvider

  yearnTokenVaultAddresses: string[] | undefined
  shapeShiftInterface = new ethers.utils.Interface(shapeShiftRouter)
  yearnInterface = new ethers.utils.Interface(yearnVault)

  approvalSigHash = this.yearnInterface.getSighash('approve')
  // TODO - work out how to use shapeShiftInterface.getSighash('deposit(address,address,uint256,uint256)')
  depositSigHash = '0x20e8c565'
  withdrawSigHash = '0x00f714ce'

  constructor(args: ParserArgs) {
    this.provider = args.provider
  }

  async parse(tx: Tx): Promise<TxSpecific<YearnTx> | undefined> {
    const data = tx.ethereumSpecific?.data
    if (!data) return

    const txSigHash = getSigHash(data)
    const abiInterface = this.getAbiInterface(txSigHash)
    if (!abiInterface) return

    const decoded = abiInterface.parseTransaction({ data })
    const receiveAddress = tx.vout?.[0].addresses?.[0]

    if (!this.yearnTokenVaultAddresses) {
      this.yearnTokenVaultAddresses = await getYearnTokenVaultAddresses(this.provider)
    }

    if (txSigHash === this.approvalSigHash && decoded?.args._spender !== SHAPE_SHIFT_ROUTER_CONTRACT) return
    if (txSigHash === this.depositSigHash && receiveAddress !== SHAPE_SHIFT_ROUTER_CONTRACT) return
    if (
      txSigHash === this.withdrawSigHash &&
      receiveAddress &&
      !this.yearnTokenVaultAddresses?.includes(receiveAddress)
    )
      return

    return {
      data: {
        method: decoded?.name,
        parser: 'yearn',
      },
    }
  }

  getAbiInterface(txSigHash: string | undefined): ethers.utils.Interface | undefined {
    return (() => {
      switch (txSigHash) {
        case this.approvalSigHash:
        case this.withdrawSigHash:
          return this.yearnInterface
        case this.depositSigHash:
          return this.shapeShiftInterface
        default:
          return undefined
      }
    })()
  }
}
