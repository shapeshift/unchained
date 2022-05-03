import { ethers } from 'ethers'
import { Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import { Dex, TradeType, TxParser } from '../../types'
import { Network, SubParser, TxSpecific } from '../types'
import THOR_ABI from './abi/thor'
import { getSigHash, txInteractsWithContract } from './utils'
import { THOR_ROUTER_CONTRACT_MAINNET, THOR_ROUTER_CONTRACT_ROPSTEN } from './constants'

const SWAP_TYPES = ['SWAP', '=', 's']

export interface ParserArgs {
  network: Network
  rpcUrl: string
}

export class Parser implements SubParser {
  readonly routerContract: string
  readonly abiInterface = new ethers.utils.Interface(THOR_ABI)

  readonly supportedFunctions = {
    depositSigHash: this.abiInterface.getSighash('deposit'),
    transferOutSigHash: this.abiInterface.getSighash('transferOut'),
  }

  constructor(args: ParserArgs) {
    // TODO: Router contract can change, use /inbound_addresses endpoint to determine current router contract
    this.routerContract = {
      mainnet: THOR_ROUTER_CONTRACT_MAINNET,
      ropsten: THOR_ROUTER_CONTRACT_ROPSTEN,
    }[args.network]
  }

  // detect address associated with transferOut internal transaction
  getInternalAddress(inputData: string): string | undefined {
    if (getSigHash(inputData) !== this.supportedFunctions.transferOutSigHash) return

    const result = this.abiInterface.decodeFunctionData(this.supportedFunctions.transferOutSigHash, inputData)

    const [type] = result.memo.split(':')
    if (type !== 'OUT' || type !== 'REFUND') return

    return result.to
  }

  async parse(tx: BlockbookTx): Promise<TxSpecific | undefined> {
    const txData = tx.ethereumSpecific?.data

    if (!txInteractsWithContract(tx, this.routerContract)) return
    if (!txData) return

    const txSigHash = getSigHash(txData)

    if (!Object.values(this.supportedFunctions).some((hash) => hash === txSigHash)) return

    const decoded = this.abiInterface.parseTransaction({ data: txData })

    // failed to decode input data
    if (!decoded) return

    const data = {
      method: decoded.name,
      parser: TxParser.Thor,
    }

    const [type] = decoded.args.memo.split(':')

    if (SWAP_TYPES.includes(type) || type === 'OUT') {
      return { trade: { dexName: Dex.Thor, type: TradeType.Trade, memo: decoded.args.memo }, data }
    }

    if (type === 'REFUND') {
      return { trade: { dexName: Dex.Thor, type: TradeType.Refund, memo: decoded.args.memo }, data }
    }

    // memo type not supported
    return
  }
}
