import { Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import { ethers } from 'ethers'
import { Dex, TradeType, TxParser } from '../../types'
import { TxSpecific, SubParser } from '../types'
import { getSigHash, txInteractsWithContract } from './utils'
import { FOXY_STAKING_CONTRACT } from './constants'
import FOXY_STAKING_ABI from './abi/foxyStaking'

export class Parser implements SubParser {
  abiInterface: ethers.utils.Interface

  supportedFoxyFunctions = {
    foxyStakingSigHash: '0x7acb7757',
    foxyUnstakeSigHash: '0x9ebea88c',
    foxyInstantUnstakingSigHash: '0x0a8dd5e6',
    foxyClaimWithdrawalSigHash: '0x516c49d9',
  }

  constructor() {
    this.abiInterface = new ethers.utils.Interface(FOXY_STAKING_ABI)
  }

  async parse(tx: BlockbookTx): Promise<TxSpecific | undefined> {
    const {
      foxyStakingSigHash,
      foxyUnstakeSigHash,
      foxyInstantUnstakingSigHash,
      foxyClaimWithdrawalSigHash,
    } = this.supportedFoxyFunctions

    if (!txInteractsWithContract(tx, FOXY_STAKING_CONTRACT)) return
    const txData = tx.ethereumSpecific?.data
    if (!txData) return

    const txSigHash = getSigHash(txData)
    const abiInterface = this.getAbiInterface(txSigHash)
    if (!abiInterface) return

    const decoded = abiInterface.parseTransaction({ txData })

    const result = (() => {
      switch (getSigHash(txData)) {
        case foxyStakingSigHash:
        case foxyUnstakeSigHash:
        case foxyInstantUnstakingSigHash:
        case foxyClaimWithdrawalSigHash:
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

  getAbiInterface(txSigHash: string | undefined): ethers.utils.Interface | undefined {
    if (Object.values(this.supportedFoxyFunctions).some((abi) => abi === txSigHash)) return this.abiInterface
    return undefined
  }
}
