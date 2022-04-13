import { Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import { ethers } from 'ethers'
import { TxParser } from '../../types'
import { TxSpecific, SubParser } from '../types'
import { getSigHash, txInteractsWithContract } from './utils'
import { FOXY_STAKING_CONTRACT } from './constants'
import FOXY_STAKING_ABI from './abi/foxyStaking'

export class Parser implements SubParser {
  abiInterface: ethers.utils.Interface

  readonly stakeSigHash: string
  readonly unstakeSigHash: string
  readonly instantUnstakeSigHash: string
  readonly claimWithdrawSigHash: string

  constructor() {
    this.abiInterface = new ethers.utils.Interface(FOXY_STAKING_ABI)
    ;(this.stakeSigHash = this.abiInterface.getSighash('stake')),
      (this.unstakeSigHash = this.abiInterface.getSighash('unstake')),
      (this.instantUnstakeSigHash = this.abiInterface.getSighash('instantUnstake')),
      (this.claimWithdrawSigHash = this.abiInterface.getSighash('claimWithdraw'))
  }

  async parse(tx: BlockbookTx): Promise<TxSpecific | undefined> {
    if (!txInteractsWithContract(tx, FOXY_STAKING_CONTRACT)) return
    const txData = tx.ethereumSpecific?.data
    if (!txData) return

    const txSigHash = getSigHash(txData)
    const abiInterface = this.getAbiInterface(txSigHash)
    if (!abiInterface) return

    const decoded = abiInterface.parseTransaction({ data: txData })

    const result = (() => {
      switch (getSigHash(txData)) {
        case this.stakeSigHash:
        case this.unstakeSigHash:
        case this.instantUnstakeSigHash:
        case this.claimWithdrawSigHash:
          return decoded.args
        default:
          return undefined
      }
    })()

    // We didn't recognise the sigHash - exit
    if (!result) return

    return {
      data: {
        method: decoded.name,
        parser: TxParser.Foxy,
      },
    }
  }

  supportedFoxyFunctions() {
    return [this.stakeSigHash, this.unstakeSigHash, this.instantUnstakeSigHash, this.claimWithdrawSigHash]
  }

  getAbiInterface(txSigHash: string | undefined): ethers.utils.Interface | undefined {
    if (this.supportedFoxyFunctions().some((abi) => abi === txSigHash)) return this.abiInterface
    return undefined
  }
}
