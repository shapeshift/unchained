import { ethers } from 'ethers'
import { Thorchain } from '@shapeshiftoss/thorchain'
import { Dex, ThorTx, TradeType, TxSpecific as ParseTxSpecific } from '../types'
import { Network } from './types'
import ABI from './abi/thor'
import { getSigHash } from './utils'
import { txInteractsWithContract } from './helpers'
import { Tx } from '@shapeshiftoss/blockbook'

const SWAP_TYPES = ['SWAP', '=', 's']

export interface ParserArgs {
  midgardUrl: string
  network: Network
  rpcUrl: string
}

export class Parser {
  abiInterface: ethers.utils.Interface
  thorchain: Thorchain

  readonly depositSigHash: string
  readonly transferOutSigHash: string
  readonly routerContract: string

  constructor(args: ParserArgs) {
    this.abiInterface = new ethers.utils.Interface(ABI)
    this.thorchain = new Thorchain({ midgardUrl: args.midgardUrl, rpcUrl: args.rpcUrl })

    this.depositSigHash = this.abiInterface.getSighash('deposit')
    this.transferOutSigHash = this.abiInterface.getSighash('transferOut')

    // TODO: Router contract can change, use /inbound_addresses endpoint to determine current router contract
    this.routerContract = {
      mainnet: '0xC145990E84155416144C532E31f89B840Ca8c2cE',
      ropsten: '0xefA28233838f46a80AaaC8c309077a9ba70D123A',
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

  async parse(tx: Tx): Promise<ParseTxSpecific<ThorTx> | undefined> {
    if (!txInteractsWithContract(tx, this.routerContract)) return
    if (!tx.ethereumSpecific?.data) return

    const result = (() => {
      switch (getSigHash(tx.ethereumSpecific.data)) {
        case this.depositSigHash:
          return this.abiInterface.decodeFunctionData(this.depositSigHash, tx.ethereumSpecific.data)
        case this.transferOutSigHash: {
          return this.abiInterface.decodeFunctionData(this.transferOutSigHash, tx.ethereumSpecific.data)
        }
        default:
          return undefined
      }
    })()

    // We didn't recognise the sigHash - exit
    if (!result) return

    const [type] = result.memo.split(':')

    if (SWAP_TYPES.includes(type) || type === 'OUT') {
      return { trade: { dexName: Dex.Thor, type: TradeType.Trade, memo: result.memo } }
    }

    if (type === 'REFUND') {
      return { trade: { dexName: Dex.Thor, type: TradeType.Refund, memo: result.memo } }
    }

    // We encountered a case we thought we'd support, but don't - exit
    return
  }
}
