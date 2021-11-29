import { ethers } from 'ethers'
import { Tx } from '@shapeshiftoss/blockbook'
import { Thorchain } from '@shapeshiftoss/thorchain'
import { Dex, TxSpecific as ParseTxSpecific, TradeType, TransferType } from '../types'
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

    const [type, ...memo] = result.memo.split(':')

    // sell side
    if (SWAP_TYPES.includes(type)) {
      //const [buyAsset] = memo

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
      const { input, fee, liquidityFee } = await this.thorchain.getTxDetails(memo, 'swap')

      return {
        fee: {
          caip19: fee.asset,
          value: fee.amount,
        },
        trade: {
          dexName: Dex.Thor,
          type: TradeType.Trade,
          memo: result.memo,
          liquidityFee,
        },
        transfers: [
          {
            caip19: input.asset,
            components: [{ value: input.amount }],
            from: '', // TODO: do we care?
            to: '', // TODO: do we care?
            totalValue: input.amount,
            type: TransferType.Send,
          },
        ],
      }
    }

    // trade refund
    if (type === 'REFUND') {
      const { input, fee } = await this.thorchain.getTxDetails(memo, 'refund')

      return {
        fee: {
          caip19: fee.asset,
          value: fee.amount,
        },
        trade: {
          dexName: Dex.Thor,
          type: TradeType.Refund,
          memo: result.memo,
        },
        transfers: [
          {
            caip19: input.asset,
            components: [{ value: input.amount }],
            from: '',
            to: '',
            totalValue: input.amount,
            type: TransferType.Send,
          },
        ],
      }
    }

    return
  }
}
