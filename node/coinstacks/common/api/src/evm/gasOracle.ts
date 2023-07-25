import axiosRetry from 'axios-retry'
import { ethers } from 'ethers'
import { Logger } from '@shapeshiftoss/logger'
import { Fees } from './models'
import { NewBlock } from '@shapeshiftoss/blockbook'
import { NodeBlock, NodeTransaction } from './types'

const exponentialDelay = async (retryCount: number) =>
  new Promise((resolve) => setTimeout(resolve, axiosRetry.exponentialDelay(retryCount)))

export interface GasOracleArgs {
  logger: Logger
  provider: ethers.providers.JsonRpcProvider
  coinstack: string
  totalBlocks?: number
}

interface TxFees {
  gasPrices: Array<number>
  maxPriorityFees: Array<number>
}

interface BlockFees extends TxFees {
  pending: boolean
  baseFeePerGas?: number
}

type EstimatedFees = Record<string, Fees>

type BlockTag = 'latest' | 'pending'

export class GasOracle {
  public readonly coinstack: string

  private readonly totalBlocks: number
  private readonly logger: Logger
  private readonly provider: ethers.providers.JsonRpcProvider

  private latestBlockTag: BlockTag
  private canQueryPendingBlockByHeight: boolean
  private feesByBlock = new Map<string, BlockFees>()
  private newBlocksQueue: Array<NewBlock> = []
  private baseFeePerGas?: string

  constructor(args: GasOracleArgs) {
    this.logger = args.logger.child({ namespace: ['gasOracle'] })
    this.provider = args.provider
    this.coinstack = args.coinstack
    this.totalBlocks = args.totalBlocks ?? 20

    // specify latestBlockTag as supported by the coinstack node
    switch (args.coinstack) {
      case 'avalanche':
        this.latestBlockTag = 'latest'
        this.canQueryPendingBlockByHeight = true
        break
      case 'optimism':
        this.latestBlockTag = 'latest'
        this.canQueryPendingBlockByHeight = true
        break
      case 'gnosis':
        this.latestBlockTag = 'latest'
        this.canQueryPendingBlockByHeight = true
        break
      case 'ethereum':
        this.latestBlockTag = 'pending'
        this.canQueryPendingBlockByHeight = false
        break
      case 'bnbsmartchain':
        this.latestBlockTag = 'pending'
        this.canQueryPendingBlockByHeight = true
        break
      case 'polygon':
        this.latestBlockTag = 'pending'
        this.canQueryPendingBlockByHeight = true
        break
      default:
        throw new Error(`no coinstack support for: ${args.coinstack}`)
    }
  }

  async start() {
    const [height, latestBlock] = await Promise.all([
      this.provider.getBlockNumber(),
      this.provider.send('eth_getBlockByNumber', [this.latestBlockTag, false]) as Promise<NodeBlock>,
    ])

    const length = this.latestBlockTag === 'pending' ? this.totalBlocks - 1 : this.totalBlocks
    const startingBlock = height - length
    const blocks = Array.from<number, number>({ length }, (_, index) => index + startingBlock + 1)
    const latest = Number(latestBlock.number)

    // add pending block if supported
    this.latestBlockTag === 'pending' && blocks.unshift(latest)

    // populate initial blocks
    await Promise.all(
      blocks.map(async (block) => this.update(block, block === latest ? this.latestBlockTag : undefined))
    )

    // start process blocks thread
    this.processBlocks()
  }

  getBaseFeePerGas(): string | undefined {
    return this.baseFeePerGas
  }

  // estimate fees based on the current oracle state
  async estimateFees(percentiles: Array<number>, blockCount = 20): Promise<EstimatedFees> {
    // sync oracle state as a safety measure in case websocket updates stop/fail
    await this.sync()

    if (this.feesByBlock.size !== this.totalBlocks) {
      this.logger.error(
        `oracle is out of sync... (current blocks: ${this.feesByBlock.size}, expected blocks: ${this.totalBlocks})`
      )
    }

    // get latest X block fees as specified by blockCount
    const blockFees = Array.from(this.feesByBlock.entries())
      .sort(([blockA], [blockB]) => {
        return Number(blockB) - Number(blockA)
      })
      .slice(0, blockCount)
      .map(([, fees]) => fees)

    const estimatedFees = percentiles.reduce<EstimatedFees>((estimatedFees, percentile) => {
      const { gasPrice, maxPriorityFee } = this.averageAtPercentile(blockFees, percentile)
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

  // onBlock websocket handler enqueues new blocks
  async onBlock(newBlock: NewBlock): Promise<void> {
    this.newBlocksQueue.push(newBlock)
  }

  // processBlock sequentially processes the newBlocksQueue
  async processBlocks(): Promise<void> {
    const newBlock = this.newBlocksQueue.shift()

    // throttle processing on empty newBlocksQueue
    if (!newBlock) {
      setTimeout(() => this.processBlocks(), 1000)
      return
    }

    try {
      await this.sync()
    } catch (err) {
      this.logger.error(err, { block: newBlock }, 'failed to handle block')
    } finally {
      this.processBlocks()
    }
  }

  // update oracle state for the specified block
  private async update(blockNumber: number, blockTag?: BlockTag, retryCount = 0): Promise<void> {
    try {
      const numOrTag =
        !this.canQueryPendingBlockByHeight && blockTag === 'pending' ? blockTag : ethers.utils.hexValue(blockNumber)

      const block = (await this.provider.send('eth_getBlockByNumber', [numOrTag, true])) as NodeBlock<
        Array<NodeTransaction>
      >

      if (!block) {
        if (retryCount >= 5) throw new Error('block not found')
        retryCount++
        await exponentialDelay(retryCount)
        return this.update(blockNumber, blockTag, retryCount)
      }

      const txFees = block.transactions.reduce<TxFees>(
        (txFees, tx) => {
          tx.gasPrice && txFees.gasPrices.push(Number(tx.gasPrice))
          tx.maxPriorityFeePerGas && txFees.maxPriorityFees.push(Number(tx.maxPriorityFeePerGas))
          return txFees
        },
        { gasPrices: [], maxPriorityFees: [] }
      )

      this.feesByBlock.set(Number(block.number).toString(), {
        pending: blockTag === 'pending',
        baseFeePerGas: block.baseFeePerGas ? Number(block.baseFeePerGas) : undefined,
        gasPrices: txFees.gasPrices.sort((a, b) => a - b),
        maxPriorityFees: txFees.maxPriorityFees.sort((a, b) => a - b),
      })

      // keep track of current baseFeePerGas for latest block tag
      if (blockTag === this.latestBlockTag) {
        switch (this.coinstack) {
          // avalanche exposes baseFeePerGas at a different rpc endpoint
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
      this.logger.error(err, { blockNumber, blockTag, retryCount }, 'failed to update')
    }
  }

  // sync oracle state by adding any missing blocks and pruning any excess blocks
  private async sync() {
    try {
      const { number } = (await this.provider.send('eth_getBlockByNumber', [this.latestBlockTag, false])) as NodeBlock

      const length = this.totalBlocks
      const latest = Number(number)
      const startingBlock = latest - length
      const blocks = Array.from({ length }, (_, index) => index + startingBlock + 1)

      // validate oracle state
      await Promise.all(
        blocks.map(async (block) => {
          const fees = this.feesByBlock.get(block.toString())

          if (fees && (!fees.pending || (this.latestBlockTag === 'pending' && block === latest))) return

          // add fees for any missing blocks or a pending block that has been confirmed
          if (block === latest) {
            await this.update(block, this.latestBlockTag)
          } else {
            await this.update(block)
          }
        })
      )

      // prune check
      if (this.feesByBlock.size <= this.totalBlocks) return

      // get sorted list of current blocks in descending order
      const sortedFeesByBlock = Array.from(this.feesByBlock.keys()).sort((a, b) => {
        return Number(b) - Number(a)
      })

      // find the index of what should be the oldest block stored
      const oldestIndex = sortedFeesByBlock.indexOf((Number(sortedFeesByBlock[0]) - this.totalBlocks).toString())

      // prune any blocks older than the oldest block if found
      if (oldestIndex !== -1) {
        sortedFeesByBlock.slice(oldestIndex).forEach((block) => this.feesByBlock.delete(block.toString()))
      }
    } catch (err) {
      this.logger.error(err, 'failed to validate')
    }
  }

  private averageAtPercentile(blockFees: Array<BlockFees>, percentile: number) {
    const valueAtPercentile = (fees: Array<number>) => {
      if (!fees.length) return 0
      const rank = Math.ceil((percentile / 100) * fees.length)
      const value = fees[rank - 1]
      return value
    }

    const sum = blockFees.reduce(
      (sum, fees) => {
        sum.gasPrice += valueAtPercentile(fees.gasPrices)
        sum.maxPriorityFee += valueAtPercentile(fees.maxPriorityFees)
        return sum
      },
      { gasPrice: 0, maxPriorityFee: 0 }
    )

    const avg = {
      gasPrice: Math.ceil(sum.gasPrice / blockFees.length),
      maxPriorityFee: Math.ceil(sum.maxPriorityFee / blockFees.length),
    }

    return avg
  }
}
