import { ethers } from 'ethers'
import { Thorchain } from '@shapeshiftoss/thorchain'
import { Dex, ThorTx, TradeType, TxSpecific } from '../types'
import { Network } from './types'
import THOR_ABI from './abi/thor'
import { getSigHash, txInteractsWithContract } from './utils'
import { Tx } from '@shapeshiftoss/blockbook'
import { GenericParser } from './index'
import { THOR_ROUTER_CONTRACT_MAINNET, THOR_ROUTER_CONTRACT_ROPSTEN } from './constants'

const SWAP_TYPES = ['SWAP', '=', 's']

export interface ParserArgs {
  midgardUrl: string
  network: Network
  rpcUrl: string
}

export class Parser implements GenericParser {
  abiInterface: ethers.utils.Interface
  thorchain: Thorchain

  readonly depositSigHash: string
  readonly transferOutSigHash: string
  readonly routerContract: string

  constructor(args: ParserArgs) {
    this.abiInterface = new ethers.utils.Interface(THOR_ABI)
    this.thorchain = new Thorchain({ midgardUrl: args.midgardUrl, rpcUrl: args.rpcUrl })

    this.depositSigHash = this.abiInterface.getSighash('deposit')
    this.transferOutSigHash = this.abiInterface.getSighash('transferOut')

    // TODO: Router contract can change, use /inbound_addresses endpoint to determine current router contract
    this.routerContract = {
      mainnet: THOR_ROUTER_CONTRACT_MAINNET,
      ropsten: THOR_ROUTER_CONTRACT_ROPSTEN,
    }[args.network]
  }

  // detect address associated with transferOut internal transaction
  getInternalAddress(inputData: string): string | undefined {
    if (getSigHash(inputData) !== this.transferOutSigHash) return

    const result = this.abiInterface.decodeFunctionData(this.transferOutSigHash, inputData)

    const [type] = result.memo.split(':')
    if (type !== 'OUT' || type !== 'REFUND') return

    return result.to
  }

  async parse(tx: Tx): Promise<TxSpecific<ThorTx> | undefined> {
    const txData = tx.ethereumSpecific?.data
    if (!txInteractsWithContract(tx, this.routerContract)) return
    if (!txData) return

    const result = (() => {
      switch (getSigHash(txData)) {
        case this.depositSigHash:
          return this.abiInterface.decodeFunctionData(this.depositSigHash, txData)
        case this.transferOutSigHash: {
          return this.abiInterface.decodeFunctionData(this.transferOutSigHash, txData)
        }
        default:
          return undefined
      }
    })()

    // We didn't recognise the sigHash - exit
    if (!result) return

    const decoded = this.abiInterface.parseTransaction({ data: txData })

    const data = {
      method: decoded.name,
      parser: 'thor',
    }

    const [type] = result.memo.split(':')

    if (SWAP_TYPES.includes(type) || type === 'OUT') {
      return { trade: { dexName: Dex.Thor, type: TradeType.Trade, memo: result.memo }, data }
    }

    if (type === 'REFUND') {
      return { trade: { dexName: Dex.Thor, type: TradeType.Refund, memo: result.memo }, data }
    }

    // We encountered a case we thought we'd support, but don't - exit
    return
  }
}
