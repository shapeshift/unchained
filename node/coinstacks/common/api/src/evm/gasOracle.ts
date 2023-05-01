import { ethers } from 'ethers'
import { Blockbook } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'

export interface GasOracleArgs {
  blockbook: Blockbook
  logger: Logger
  provider: ethers.providers.JsonRpcProvider
  rpcUrl: string
}

interface TxFees {
  gasPrices: Array<number>
  maxPriorityFees: Array<number>
}

interface BlockFees extends TxFees {
  blockNumber: number
  baseFeePerGas?: number
}

//interface GasEstimate {
//  gasPrice: string
//  maxFeePerGas: string
//  maxPriorityFeePerGas: string
//}

export class GasOracle {
  private readonly totalBlocks = 20
  private readonly blockbook: Blockbook
  private readonly logger: Logger
  private readonly provider: ethers.providers.JsonRpcProvider
  private readonly rpcUrl: string

  private blocks: Array<BlockFees> = []

  constructor(args: GasOracleArgs) {
    this.blockbook = args.blockbook
    this.logger = args.logger.child({ namespace: ['gasOracle'] })
    this.provider = args.provider
    this.rpcUrl = args.rpcUrl

    this.logger.trace(`${this.totalBlocks}, ${this.blockbook}, ${this.rpcUrl}`)
  }

  static async start(args: GasOracleArgs): Promise<GasOracle> {
    const oracle = new GasOracle(args)
    await oracle.init()
    return oracle
  }

  async init() {
    const height = await this.provider.getBlockNumber()
    console.log({ height })

    for (let blockNumber = height; blockNumber > height - this.totalBlocks; blockNumber--) {
      const block = await this.provider.getBlockWithTransactions(blockNumber)
      const gasFees = block.transactions.reduce<TxFees>(
        (prev, tx) => {
          tx.gasPrice && prev.gasPrices.push(tx.gasPrice.toNumber())
          tx.maxPriorityFeePerGas && prev.maxPriorityFees.push(tx.maxPriorityFeePerGas.toNumber())
          return prev
        },
        { gasPrices: [], maxPriorityFees: [] }
      )

      this.blocks.push({
        blockNumber,
        baseFeePerGas: block.baseFeePerGas?.toNumber(),
        gasPrices: gasFees.gasPrices.sort((a, b) => a - b),
        maxPriorityFees: gasFees.maxPriorityFees.sort((a, b) => a - b),
      })
    }

    //console.log({ blocks: this.blocks })
    console.log(this.blocks.length)
    console.log(await this.estimateGasPrice([1, 60, 90]))
    console.log('gasPrice', Number((await this.provider.send('eth_gasPrice', [])) as string))
    console.log('maxPriorityFeePerGas', Number((await this.provider.send('eth_maxPriorityFeePerGas', [])) as string))
  }

  averageAtPercentile(percentile: number) {
    const sum = this.blocks.reduce(
      (prev, block) => {
        console.log(block.blockNumber, block.gasPrices[0], block.maxPriorityFees[0], block.maxPriorityFees.length)
        const gasPriceRank = Math.ceil((percentile / 100) * block.gasPrices.length)
        const gasPriceValue = block.gasPrices[gasPriceRank - 1]
        prev.gasPrice += gasPriceValue

        const maxPriorityFeeRank = Math.ceil((percentile / 100) * block.maxPriorityFees.length)
        const maxPriorityFeeValue = block.maxPriorityFees[maxPriorityFeeRank - 1]
        prev.maxPriorityFee += maxPriorityFeeValue

        return prev
      },
      { gasPrice: 0, maxPriorityFee: 0 }
    )

    return {
      gasPrice: Math.ceil(sum.gasPrice / this.blocks.length),
      maxPriorityFee: Math.ceil(sum.maxPriorityFee / this.blocks.length),
    }
  }

  async estimateGasPrice(percentiles: Array<number>): Promise<Record<number, number>> {
    const { baseFeePerGas } = (await this.provider.send('eth_getBlockByNumber', ['pending', false])) as {
      baseFeePerGas?: string
    }

    console.log('baseFeePerGas', Number(baseFeePerGas))

    return percentiles.reduce((prev, percentile) => {
      const { gasPrice, maxPriorityFee } = this.averageAtPercentile(percentile)
      prev[percentile.toString()] = {
        gasPrice: gasPrice.toFixed(0),
        maxFeePerGas: (maxPriorityFee + Number(baseFeePerGas)).toFixed(0),
        maxPriorityFeePerGas: maxPriorityFee.toFixed(0),
      }
      return prev
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }, {} as any)
  }
}
