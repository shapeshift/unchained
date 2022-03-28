import { ChainId, Yearn } from '@yfi/sdk'
import { Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import { ethers } from 'ethers'
import { Network, SubParser, TxSpecific } from '../types'
import { SHAPE_SHIFT_ROUTER_CONTRACT } from './constants'
import { getSigHash } from './utils'
import shapeShiftRouter from './abi/shapeShiftRouter'
import yearnVault from './abi/yearnVault'

interface ParserArgs {
  network: Network
  provider: ethers.providers.JsonRpcProvider
}

export class Parser implements SubParser {
  provider: ethers.providers.JsonRpcProvider
  yearnSdk: Yearn<ChainId> | undefined

  yearnTokenVaultAddresses: string[] | undefined
  shapeShiftInterface = new ethers.utils.Interface(shapeShiftRouter)
  yearnInterface = new ethers.utils.Interface(yearnVault)

  supportedYearnFunctions = {
    yearnApprovalSigHash: this.yearnInterface.getSighash('approve'),
    yearnDepositSigHash: '0xd0e30db0',
    yearnDepositWithAmountSigHash: '0xb6b55f25',
    yearnDepositWithAmountAndRecipientSigHash: '0x6e553f65',
    yearnWithdrawSigHash: '0x00f714ce',
  }

  supportedShapeShiftFunctions = {
    shapeShiftDepositSigHash: '0x20e8c565',
  }

  constructor(args: ParserArgs) {
    this.provider = args.provider

    // The only Yearn-supported chain we currently support is mainnet
    if (args.network == 'mainnet') {
      // 1 for EthMain (@yfi/sdk/dist/chain.d.ts)
      this.yearnSdk = new Yearn(1, { provider: this.provider, disableAllowlist: true })
    }
  }

  async parse(tx: BlockbookTx): Promise<TxSpecific | undefined> {
    const { yearnApprovalSigHash, yearnWithdrawSigHash } = this.supportedYearnFunctions
    const { shapeShiftDepositSigHash } = this.supportedShapeShiftFunctions
    const data = tx.ethereumSpecific?.data
    if (!data) return

    const txSigHash = getSigHash(data)
    const abiInterface = this.getAbiInterface(txSigHash)
    if (!abiInterface) return

    const decoded = abiInterface.parseTransaction({ data })
    const receiveAddress = tx.vout?.[0].addresses?.[0]

    if (!this.yearnTokenVaultAddresses) {
      const vaults = await this.yearnSdk?.vaults.get()
      this.yearnTokenVaultAddresses = vaults?.map((vault) => vault.address)
    }

    if (txSigHash === yearnApprovalSigHash && decoded?.args._spender !== SHAPE_SHIFT_ROUTER_CONTRACT) return
    if (txSigHash === shapeShiftDepositSigHash && receiveAddress !== SHAPE_SHIFT_ROUTER_CONTRACT) return
    if (
      txSigHash === yearnWithdrawSigHash &&
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
    if (Object.values(this.supportedYearnFunctions).some((abi) => abi === txSigHash)) return this.yearnInterface
    if (Object.values(this.supportedShapeShiftFunctions).some((abi) => abi === txSigHash))
      return this.shapeShiftInterface
    return undefined
  }
}
