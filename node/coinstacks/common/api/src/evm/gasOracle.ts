/* eslint-disable @typescript-eslint/no-unused-vars */
import { ethers } from 'ethers'
import { Logger } from '@shapeshiftoss/logger'
import { Fees } from './models'
import { NewBlock } from '@shapeshiftoss/blockbook'
import { NodeBlock, NodeTransaction } from './types'

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

type BlockTag = 'latest' | 'pending'

export class GasOracle {
  public readonly coinstack: string

  private readonly totalBlocks = 20
  private readonly logger: Logger
  private readonly provider: ethers.providers.JsonRpcProvider

  private latestBlockTag: BlockTag
  private feesByBlock = new Map<string, BlockFees>()
  private baseFeePerGas?: string

  constructor(args: GasOracleArgs) {
    this.logger = args.logger.child({ namespace: ['gasOracle'] })
    this.provider = args.provider
    this.coinstack = args.coinstack

    switch (args.coinstack) {
      case 'optimism':
        this.latestBlockTag = 'latest'
        break
      default:
        this.latestBlockTag = 'pending'
    }
  }

  async start() {
    const height = await this.provider.getBlockNumber()
    const length = this.totalBlocks - 1
    const startingBlock = height - length
    const blocks = Array.from<number, BlockTag | number>({ length }, (_, index) => index + startingBlock + 1)
    blocks.unshift(this.latestBlockTag)
    await Promise.all(blocks.map(async (blockNumber) => this.update(blockNumber)))
  }

  getBaseFeePerGas(): string | undefined {
    return this.baseFeePerGas
  }

  // estimate fees based on the current oracle state
  async estimateFees(percentiles: Array<number>): Promise<EstimatedFees> {
    // validate oracle state and get back the latest block number
    const latest = await this.validate()

    if (this.feesByBlock.size !== this.totalBlocks) {
      this.logger.error(`current blocks: ${this.feesByBlock.size}, expected blocks: ${this.totalBlocks}`)
    }

    const latestWithBuffer = latest - 1
    if (!this.feesByBlock.has(latestWithBuffer.toString())) {
      this.logger.error(`oracle is out of sync...`)
    }

    const estimatedFees = percentiles.reduce<EstimatedFees>((estimatedFees, percentile) => {
      const { gasPrice, maxPriorityFee } = this.averageAtPercentile(percentile)
      estimatedFees[percentile.toString()] = {
        gasPrice: gasPrice.toFixed(0),
        ...(this.baseFeePerGas && {
          maxFeePerGas: (maxPriorityFee + Number(this.baseFeePerGas)).toFixed(0),
          maxPriorityFeePerGas: maxPriorityFee.toFixed(0),
        }),
      }
      return estimatedFees
    }, {})

    return estimatedFees
  }

  // handle new block event over websocket
  async onBlock(newBlock: NewBlock): Promise<void> {
    try {
      await this.update(this.latestBlockTag)
      console.log(newBlock.height)
      await this.validate(newBlock.height)
    } catch (err) {
      this.logger.error(err, { block: newBlock }, 'failed to handle block')
    }
  }

  // update oracle state for the specified block
  private async update(blockNumber: BlockTag | number) {
    if (this.feesByBlock.has(blockNumber.toString())) return

    try {
      //const block = await this.provider.getBlockWithTransactions(blockNumber)
      const numOrTag =
        blockNumber === this.latestBlockTag
          ? blockNumber
          : ethers.utils.hexStripZeros(ethers.utils.hexlify(blockNumber))
      const block = (await this.provider.send('eth_getBlockByNumber', [numOrTag, true])) as NodeBlock<
        Array<NodeTransaction>
      >

      if (!block) throw new Error('no block found')

      const txFees = block.transactions.reduce<TxFees>(
        (txFees, tx) => {
          tx.gasPrice && txFees.gasPrices.push(Number(tx.gasPrice))
          tx.maxPriorityFeePerGas && txFees.maxPriorityFees.push(Number(tx.maxPriorityFeePerGas))
          return txFees
        },
        { gasPrices: [], maxPriorityFees: [] }
      )

      this.feesByBlock.set(Number(block.number).toString(), {
        baseFeePerGas: block.baseFeePerGas ? Number(block.baseFeePerGas) : undefined,
        gasPrices: txFees.gasPrices.sort((a, b) => a - b),
        maxPriorityFees: txFees.maxPriorityFees.sort((a, b) => a - b),
      })

      // keep track of current baseFeePerGas
      if (blockNumber === this.latestBlockTag) {
        switch (this.coinstack) {
          // avalanche returns the latest block for 'pending', use eth_baseFee instead for accurate base fee
          case 'avalanche': {
            const baseFee = (await this.provider.send('eth_baseFee', [])) as string
            this.baseFeePerGas = Number(baseFee).toString()
            break
          }
          default:
            this.baseFeePerGas = block.baseFeePerGas ? Number(block.baseFeePerGas).toString() : undefined
        }
      }
    } catch (err) {
      this.logger.error(err, { blockNumber }, 'failed to update')
    }
  }

  // validate accurate oracle state by adding any missing blocks and pruning any excess blocks
  private async validate(blockNumber?: number): Promise<number> {
    try {
      const numOrTag = blockNumber ? ethers.utils.hexStripZeros(ethers.utils.hexlify(blockNumber)) : this.latestBlockTag

      const { number } = (await this.provider.send('eth_getBlockByNumber', [numOrTag, false])) as {
        number: string
      }

      const length = this.totalBlocks
      const latest = Number(number)
      const startingBlock = latest - length
      const blocks = Array.from({ length }, (_, index) => index + startingBlock + 1)

      console.log('validate start', this.feesByBlock.size, latest)

      // ensure there are fees for all expected blocks
      await Promise.all(
        blocks.map(async (block) => {
          if (this.feesByBlock.has(block.toString())) return
          console.log('adding missing block', block)
          // add fees for block if missing
          await this.update(block === latest ? this.latestBlockTag : block)
        })
      )

      // get sorted list of current blocks in descending order
      const sortedFeesByBlock = Array.from(this.feesByBlock.keys()).sort((a, b) => {
        return Number(b) - Number(a)
      })

      console.log({ sortedFeesByBlock })

      // find the index of what should be the oldest block stored
      const oldestIndex = sortedFeesByBlock.indexOf((latest - this.totalBlocks).toString())

      console.log({ oldestIndex, keep: latest - this.totalBlocks })

      // prune any blocks older than the oldest block if found
      if (oldestIndex !== -1) {
        console.log({ prune: sortedFeesByBlock.slice(oldestIndex) })
        sortedFeesByBlock.slice(oldestIndex).forEach((block) => this.feesByBlock.delete(block.toString()))
      }

      console.log('validate end', this.feesByBlock.size)
      return latest
    } catch (err) {
      this.logger.error(err, 'failed to validate')
      return -1
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
