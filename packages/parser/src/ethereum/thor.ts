import { ethers } from 'ethers'
import { Tx } from '@shapeshiftoss/blockbook'
import { Thorchain } from '@shapeshiftoss/thorchain'
import { Dex, TxSpecific as ParseTxSpecific, TradeType } from '../types'
import { Network } from './types'
import ABI from './abi/thor'
import { getSigHash } from './utils'

const SWAP_TYPES = ['SWAP', '=', 's']

export interface ParserArgs {
  midgardUrl: string
  network: Network
}

export class Parser {
  abiInterface: ethers.utils.Interface
  thorchain: Thorchain

  readonly depositSigHash: string
  readonly transferOutSigHash: string
  readonly routerContract: string

  constructor(args: ParserArgs) {
    this.abiInterface = new ethers.utils.Interface(ABI)
    this.thorchain = new Thorchain({ midgardUrl: args.midgardUrl })

    this.depositSigHash = this.abiInterface.getSighash('deposit')
    this.transferOutSigHash = this.abiInterface.getSighash('transferOut')

    // TODO: Router contract can change, use /inbound_addresses endpoint to determine current router contract
    this.routerContract = {
      MAINNET: '0xC145990E84155416144C532E31f89B840Ca8c2cE',
      ETH_ROPSTEN: '0xefA28233838f46a80AaaC8c309077a9ba70D123A',
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

  async parse(tx: Tx): Promise<ParseTxSpecific | undefined> {
    if (!tx.ethereumSpecific?.data) return

    let result: ethers.utils.Result
    switch (getSigHash(tx.ethereumSpecific.data)) {
      case this.depositSigHash:
        result = this.abiInterface.decodeFunctionData(this.depositSigHash, tx.ethereumSpecific.data)
        break
      case this.transferOutSigHash: {
        result = this.abiInterface.decodeFunctionData(this.transferOutSigHash, tx.ethereumSpecific.data)
        break
      }
      default:
        return
    }

    const [type] = result.memo.split(':')

    // sell side
    if (SWAP_TYPES.includes(type)) {
      return {
        trade: {
          dexName: Dex.Thor,
          type: TradeType.Trade,
          memo: result.memo,
        },
      }
    }

    // buy side
    if (type === 'OUT') {
      return {
        trade: {
          dexName: Dex.Thor,
          type: TradeType.Trade,
          memo: result.memo,
        },
      }
    }

    // trade refund
    if (type === 'REFUND') {
      return {
        trade: {
          dexName: Dex.Thor,
          type: TradeType.Refund,
          memo: result.memo,
        },
      }
    }

    return
  }
}
