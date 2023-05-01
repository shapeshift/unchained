import { ethers } from 'ethers'
import { Logger } from '@shapeshiftoss/logger'
import { Fees } from './models'
import { NewBlock } from '@shapeshiftoss/blockbook'

export interface GasOracleArgs {
  logger: Logger
  provider: ethers.providers.JsonRpcProvider
}

interface TxFees {
  gasPrices: Array<number>
  maxPriorityFees: Array<number>
}

interface BlockFees extends TxFees {
  baseFeePerGas?: number
}

type EstimatedFees = Record<string, Fees>

export class GasOracle {
  private readonly totalBlocks = 20
  private readonly logger: Logger
  private readonly provider: ethers.providers.JsonRpcProvider

  private feesByBlock = new Map<string, BlockFees>()

  constructor(args: GasOracleArgs) {
    this.logger = args.logger.child({ namespace: ['gasOracle'] })
    this.provider = args.provider
  }

  async start() {
    const height = await this.provider.getBlockNumber()
    const length = this.totalBlocks - 1
    const startingBlock = height - length
    const blocks = Array.from<number, string | number>({ length }, (_, index) => index + 1 + startingBlock)
    blocks.push('pending')
    await Promise.all(blocks.map(async (blockNumber) => this.update(blockNumber)))
  }

  getBaseFeePerGas(): string | undefined {
    return this.feesByBlock.get('pending')?.baseFeePerGas?.toString()
  }

  // estimate fees based on the current oracle state
  async estimateFees(percentiles: Array<number>): Promise<EstimatedFees> {
    const { baseFeePerGas, number } = (await this.provider.send('eth_getBlockByNumber', ['pending', false])) as {
      number: string
      baseFeePerGas?: string
    }

    const latestBlock = Number(number) - 1

    await this.validate(latestBlock)

    if (this.feesByBlock.size !== this.totalBlocks) {
      this.logger.error(`current blocks: ${this.feesByBlock.size}, expected blocks: ${this.totalBlocks}`)
    }

    const latestBlockBuffer = latestBlock - 1
    if (!this.feesByBlock.has(latestBlockBuffer.toString())) {
      this.logger.error(`oracle is out of sync...`)
    }

    const estimatedFees = percentiles.reduce<EstimatedFees>((prev, percentile) => {
      const { gasPrice, maxPriorityFee } = this.averageAtPercentile(percentile)
      prev[percentile.toString()] = {
        gasPrice: gasPrice.toFixed(0),
        maxFeePerGas: (maxPriorityFee + Number(baseFeePerGas)).toFixed(0),
        maxPriorityFeePerGas: maxPriorityFee.toFixed(0),
      }
      return prev
    }, {})

    return estimatedFees
  }

  // handle new block event over websocket
  async onBlock(block: NewBlock): Promise<void> {
    try {
      await Promise.all([await this.update(block.height), await this.update('pending')])
      this.validate(block.height)
    } catch (err) {
      this.logger.error(err, { block }, 'failed to handleBlock')
    }
  }

  // update oracle state for the specified block
  private async update(blockNumber: string | number) {
    try {
      const block = await this.provider.getBlockWithTransactions(blockNumber)

      const gasFees = block.transactions.reduce<TxFees>(
        (prev, tx) => {
          tx.gasPrice && prev.gasPrices.push(tx.gasPrice.toNumber())
          tx.maxPriorityFeePerGas && prev.maxPriorityFees.push(tx.maxPriorityFeePerGas.toNumber())
          return prev
        },
        { gasPrices: [], maxPriorityFees: [] }
      )

      this.feesByBlock.set(blockNumber.toString(), {
        baseFeePerGas: block.baseFeePerGas?.toNumber(),
        gasPrices: gasFees.gasPrices.sort((a, b) => a - b),
        maxPriorityFees: gasFees.maxPriorityFees.sort((a, b) => a - b),
      })
    } catch (err) {
      this.logger.error(err, { blockNumber }, 'failed to updateBlocks')
    }
  }

  // validate accurate oracle state by adding any missing blocks and pruning any excess blocks
  private async validate(latest: number): Promise<void> {
    try {
      // ensure there are fees for all expected blocks
      for (let blockNumber = latest; blockNumber > latest - this.totalBlocks + 1; blockNumber--) {
        // add fees for block if missing
        if (!this.feesByBlock.has(blockNumber.toString())) await this.update(latest)
      }

      // get sorted list of current blocks in descending order
      const sortedBlocks = Array.from(this.feesByBlock.keys()).sort((a, b) => {
        if (a === 'pending') return -1
        return Number(b) - Number(a)
      })

      // find the index of what should be the oldest block stored
      const oldestIndex = sortedBlocks.indexOf((latest - this.totalBlocks + 1).toString())

      // prune any blocks older than the oldest block if found
      if (oldestIndex !== -1) {
        sortedBlocks.slice(oldestIndex).forEach((block) => this.feesByBlock.delete(block.toString()))
      }
    } catch (err) {
      this.logger.error(err, { latest }, 'failed to pruneBlocks')
    }
  }

  private averageAtPercentile(percentile: number) {
    const valueAtPercentile = (fees: Array<number>) => {
      const rank = Math.ceil((percentile / 100) * fees.length)
      const value = fees[rank - 1]
      return value
    }

    const sum = { gasPrice: 0, maxPriorityFee: 0 }

    this.feesByBlock.forEach((fees) => {
      sum.gasPrice += valueAtPercentile(fees.gasPrices)
      sum.maxPriorityFee += valueAtPercentile(fees.maxPriorityFees)
    })

    const avg = {
      gasPrice: Math.ceil(sum.gasPrice / this.feesByBlock.size),
      maxPriorityFee: Math.ceil(sum.maxPriorityFee / this.feesByBlock.size),
    }

    return avg
  }
}
