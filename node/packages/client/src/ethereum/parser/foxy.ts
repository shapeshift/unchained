import { Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import { ethers } from 'ethers'
import { TxParser } from '../../types'
import { TxSpecific, SubParser } from '../types'
import { getSigHash, txInteractsWithContract } from './utils'
import { FOXY_STAKING_CONTRACT } from './constants'
import FOXY_STAKING_ABI from './abi/foxyStaking'

export class Parser implements SubParser {
  abiInterface = new ethers.utils.Interface(FOXY_STAKING_ABI)

  readonly supportedFunctions = {
    stakeSigHash: this.abiInterface.getSighash('stake(uint256,address)'),
    unstakeSigHash: this.abiInterface.getSighash('unstake'),
    instantUnstakeSigHash: this.abiInterface.getSighash('instantUnstake'),
    claimWithdrawSigHash: this.abiInterface.getSighash('claimWithdraw'),
  }

  async parse(tx: BlockbookTx): Promise<TxSpecific | undefined> {
    if (!txInteractsWithContract(tx, FOXY_STAKING_CONTRACT)) return
    if (!tx.ethereumSpecific?.data) return

    const txSigHash = getSigHash(tx.ethereumSpecific.data)

    if (!Object.values(this.supportedFunctions).some((hash) => hash === txSigHash)) return

    const decoded = this.abiInterface.parseTransaction({ data: tx.ethereumSpecific.data })

    switch (txSigHash) {
      case this.supportedFunctions.stakeSigHash:
      case this.supportedFunctions.unstakeSigHash:
      case this.supportedFunctions.instantUnstakeSigHash:
      case this.supportedFunctions.claimWithdrawSigHash:
        return {
          data: {
            method: decoded.name,
            parser: TxParser.Foxy,
          },
        }
      default:
        return
    }
  }
}
