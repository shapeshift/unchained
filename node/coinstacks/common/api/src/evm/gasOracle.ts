/* eslint-disable @typescript-eslint/no-unused-vars */
import { ethers } from 'ethers'
import { Logger } from '@shapeshiftoss/logger'
import { Fees } from './models'
import { NewBlock } from '@shapeshiftoss/blockbook'

export interface GasOracleArgs {
  logger: Logger
  provider: ethers.providers.JsonRpcProvider
  coinstack: string
}

interface TxFees {
  gasPrices: Array<number>
  maxPriorityFees: Array<number>
}

interface BlockFees extends TxFees {
  blockNumber?: number // additional metadata for pending block
  baseFeePerGas?: number
}

type EstimatedFees = Record<string, Fees>

export class GasOracle {
  public readonly coinstack: string

  private readonly totalBlocks = 20
  private readonly logger: Logger
  private readonly provider: ethers.providers.JsonRpcProvider

  private feesByBlock = new Map<string, BlockFees>()
  private baseFeePerGas?: string

  constructor(args: GasOracleArgs) {
    this.logger = args.logger.child({ namespace: ['gasOracle'] })
    this.provider = args.provider
    this.coinstack = args.coinstack
  }

  async start() {
    const height = await this.provider.getBlockNumber()
    const length = this.totalBlocks - 1
    const startingBlock = height - length
    const blocks = Array.from<number, 'pending' | number>({ length }, (_, index) => index + 1 + startingBlock)
    blocks.unshift('pending')
    await Promise.all(blocks.map(async (blockNumber) => this.update(blockNumber)))
  }

  getBaseFeePerGas(): string | undefined {
    return this.baseFeePerGas
  }

  // estimate fees based on the current oracle state
  async estimateFees(percentiles: Array<number>): Promise<EstimatedFees> {
    const { number } = (await this.provider.send('eth_getBlockByNumber', ['pending', false])) as {
      number: string
    }

    // validate from pending block number to ensure accurate state before estimating
    const latest = Number(number)
    await this.validate(latest, true)

    if (this.feesByBlock.size !== this.totalBlocks) {
      this.logger.error(`current blocks: ${this.feesByBlock.size}, expected blocks: ${this.totalBlocks}`)
    }

    const latestWithBuffer = latest - 1
    if (!this.feesByBlock.has(latestWithBuffer.toString())) {
      this.logger.error(`oracle is out of sync...`)
    }

    const estimatedFees = percentiles.reduce<EstimatedFees>((prev, percentile) => {
      const { gasPrice, maxPriorityFee } = this.averageAtPercentile(percentile)
      prev[percentile.toString()] = {
        gasPrice: gasPrice.toFixed(0),
        maxFeePerGas: (maxPriorityFee + Number(this.baseFeePerGas)).toFixed(0),
        maxPriorityFeePerGas: maxPriorityFee.toFixed(0),
      }
      return prev
    }, {})

    return estimatedFees
  }

  // handle new block event over websocket
  async onBlock(newBlock: NewBlock): Promise<void> {
    try {
      switch (this.coinstack) {
        // avalanche returns the latest block for the pending tag
        // pending tag is used to ensure baseFeePerGas is updated
        // validate using newBlock height as no pending blocks are available
        case 'avalanche': {
          await this.update('pending')
          this.validate(newBlock.height)
          break
        }
        // update newBlock and pending block to ensure most accurate up to date state
        // validate using newBlock height + 1, which is the pending block height
        default: {
          await Promise.all([this.update('pending'), this.update(newBlock.height)])
          this.validate(newBlock.height + 1, true)
        }
      }
    } catch (err) {
      this.logger.error(err, { block: newBlock }, 'failed to handleBlock')
    }
  }

  // update oracle state for the specified block
  private async update(blockNumber: 'pending' | number) {
    if (this.feesByBlock.has(blockNumber.toString())) return

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

      this.feesByBlock.set(block.number.toString(), {
        baseFeePerGas: block.baseFeePerGas?.toNumber(),
        gasPrices: gasFees.gasPrices.sort((a, b) => a - b),
        maxPriorityFees: gasFees.maxPriorityFees.sort((a, b) => a - b),
      })

      // keep track of current baseFeePerGas for pending block
      if (blockNumber === 'pending') {
        switch (this.coinstack) {
          // avalanche returns the latest block for 'pending', use eth_baseFee instead for accurate base fee
          case 'avalanche': {
            const baseFee = (await this.provider.send('eth_baseFee', [])) as string
            this.baseFeePerGas = Number(baseFee).toString()
            break
          }
          default:
            this.baseFeePerGas = block.baseFeePerGas?.toString()
        }
      }
    } catch (err) {
      this.logger.error(err, { blockNumber }, 'failed to updateBlocks')
    }
  }

  // validate accurate oracle state by adding any missing blocks and pruning any excess blocks
  private async validate(latest: number, isPending = false): Promise<void> {
    try {
      const length = this.totalBlocks
      const startingBlock = latest - length
      const blocks = Array.from({ length }, (_, index) => index + startingBlock + 1)

      // ensure there are fees for all expected blocks
      await Promise.all(
        blocks.map(async (block) => {
          if (this.feesByBlock.has(block.toString())) return
          // add fees for block if missing
          await this.update(isPending && block === latest ? 'pending' : block)
        })
      )

      // get sorted list of current blocks in descending order
      const sortedBlocks = Array.from(this.feesByBlock.keys()).sort((a, b) => {
        return Number(b) - Number(a)
      })

      // find the index of what should be the oldest block stored
      const oldestIndex = sortedBlocks.indexOf((latest - this.totalBlocks).toString())

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
      if (!fees.length) return 0
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
