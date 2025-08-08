import { NewBlock } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'
import { exponentialDelay } from '../utils'
import { Fees } from './models'
import { Chain, fromHex, Hex, PublicClient, Transport } from 'viem'

export interface GasOracleArgs {
  logger: Logger
  client: PublicClient
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

const getFeeThreshold = (arr: number[]): number => {
  const magnitudeThreshold = 10

  arr = arr.sort((a, b) => a - b)

  const mid = Math.floor(arr.length / 2)
  const median = arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid]

  return median * magnitudeThreshold
}

export class GasOracle {
  public readonly coinstack: string

  private readonly totalBlocks: number
  private readonly logger: Logger
  private readonly client: PublicClient<
    Transport,
    Chain | undefined,
    undefined,
    readonly [{ Method: 'eth_baseFee'; Parameters: undefined; ReturnType: Hex }]
  >

  private feesByBlock = new Map<string, BlockFees>()
  private newBlocksQueue: Array<NewBlock> = []
  private baseFeePerGas?: string

  private baseFeeBuffer: boolean
  private latestBlockTag: BlockTag
  private canQueryPendingBlockByHeight: boolean

  constructor(args: GasOracleArgs) {
    this.logger = args.logger.child({ namespace: ['gasOracle'] })
    this.client = args.client
    this.coinstack = args.coinstack
    this.totalBlocks = args.totalBlocks ?? 20

    // specify latestBlockTag as supported by the coinstack node
    switch (args.coinstack) {
      case 'avalanche':
        this.baseFeeBuffer = false
        this.latestBlockTag = 'latest'
        this.canQueryPendingBlockByHeight = true
        break
      case 'optimism':
        this.baseFeeBuffer = true
        this.latestBlockTag = 'latest'
        this.canQueryPendingBlockByHeight = true
        break
      case 'base':
        this.latestBlockTag = 'latest'
        this.canQueryPendingBlockByHeight = true
        this.baseFeeBuffer = true
        break
      case 'gnosis':
        this.baseFeeBuffer = false
        this.latestBlockTag = 'latest'
        this.canQueryPendingBlockByHeight = true
        break
      case 'ethereum':
        this.baseFeeBuffer = false
        this.latestBlockTag = 'pending'
        this.canQueryPendingBlockByHeight = false
        break
      case 'bnbsmartchain':
        this.baseFeeBuffer = false
        this.latestBlockTag = 'pending'
        this.canQueryPendingBlockByHeight = true
        break
      case 'polygon':
        this.baseFeeBuffer = false
        this.latestBlockTag = 'pending'
        this.canQueryPendingBlockByHeight = true
        break
      case 'arbitrum':
      case 'arbitrum-nova':
        this.baseFeeBuffer = false
        this.latestBlockTag = 'pending'
        this.canQueryPendingBlockByHeight = true
        break
      default:
        throw new Error(`no coinstack support for: ${args.coinstack}`)
    }
  }

  async start() {
    const { number } = await this.client.getBlock({ blockTag: this.latestBlockTag, includeTransactions: false })

    const height = Number(number)
    const length = this.totalBlocks
    const startingBlock = height - length
    const blocks = Array.from<number, number>({ length }, (_, index) => index + startingBlock + 1)

    // populate initial blocks
    await Promise.all(
      blocks.map(async (block) => this.update(block, block === height ? this.latestBlockTag : undefined))
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
          maxFeePerGas: (maxPriorityFee + Number(this.baseFeePerGas) * (this.baseFeeBuffer ? 2 : 1)).toFixed(0),
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
      const numOrTag = (() => {
        if (!this.canQueryPendingBlockByHeight && blockTag === 'pending') return { blockTag }
        if (this.coinstack === 'avalanche' && blockTag === 'latest') return { blockTag }
        return { blockNumber: BigInt(blockNumber) }
      })()

      const block = await this.client.getBlock({ ...numOrTag, includeTransactions: true })

      if (!block) {
        if (++retryCount >= 5) throw new Error('block not found')
        await exponentialDelay(retryCount)
        return this.update(blockNumber, blockTag, retryCount)
      }

      const txFees = block.transactions.reduce<TxFees>(
        (txFees, tx) => {
          // omit non standard tx types that pays no gas
          if ((tx.type === 'eip4844' || tx.type === 'eip7702') && tx.gasPrice === 0n) return txFees
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
            const baseFee = await this.client.request({ method: 'eth_baseFee' })
            this.baseFeePerGas = fromHex(baseFee, 'bigint').toString()
            break
          }
          default:
            this.baseFeePerGas = block.baseFeePerGas ? Number(block.baseFeePerGas).toString() : undefined
        }
      }
    } catch (err) {
      if (++retryCount >= 5) {
        this.logger.error(err, { blockNumber, blockTag, retryCount }, 'failed to update')
      } else {
        await exponentialDelay(retryCount)
        return this.update(blockNumber, blockTag, retryCount)
      }
    }
  }

  // sync oracle state by adding any missing blocks and pruning any excess blocks
  private async sync() {
    try {
      const { number } = await this.client.getBlock({ blockTag: this.latestBlockTag, includeTransactions: false })

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

    const gasPriceThreshold = getFeeThreshold(
      blockFees
        .map((fees) => fees.gasPrices)
        .flat()
        .filter((gasPrice) => gasPrice > 1)
    )

    const maxPriorityFeeThreshold = getFeeThreshold(
      blockFees
        .map((fees) => fees.maxPriorityFees)
        .flat()
        .filter((maxPriorityFee) => maxPriorityFee > 1)
    )

    const sum = blockFees.reduce(
      (sum, fees) => {
        sum.gasPrice += valueAtPercentile(fees.gasPrices.filter((gasPrice) => gasPrice <= gasPriceThreshold))
        sum.maxPriorityFee += valueAtPercentile(
          fees.maxPriorityFees.filter((maxPriorityFee) => maxPriorityFee <= maxPriorityFeeThreshold)
        )
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
