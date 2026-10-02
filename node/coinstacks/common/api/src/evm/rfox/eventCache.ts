import { PublicClient, Address, GetContractEventsReturnType } from 'viem'
import { RFOX_ABI } from './abi'
import { Logger } from '@shapeshiftoss/logger'

export type StakingDuration = Record<string, number>
export type Event = GetContractEventsReturnType<typeof RFOX_ABI, 'Stake' | 'Unstake'>[number]

interface Events {
  eventsByAddress: Map<string, Array<Event>>
  lastIndexedBlock: bigint
}

export interface EventCacheArgs {
  client: PublicClient
  alchemyClient: PublicClient
  logger: Logger
  /** start block to index from, by staking contract address */
  contracts: Record<Address, bigint>
}

export class EventCache {
  private client: PublicClient
  private alchemyClient: PublicClient
  private logger: Logger

  private cache: Map<Address, Events>

  constructor(args: EventCacheArgs) {
    this.client = args.client
    this.alchemyClient = args.alchemyClient
    this.logger = args.logger.child({ namespace: ['eventCache'] })
    this.cache = new Map(
      Object.entries(args.contracts).map(([contractAddress, startBlock]) => [
        contractAddress as Address,
        { eventsByAddress: new Map(), lastIndexedBlock: startBlock },
      ])
    )
  }

  async initialize() {
    try {
      this.logger.info('Event cache initializing')
      for (const contractAddress of Array.from(this.cache.keys())) {
        await this.indexContractEvents(contractAddress)
      }
      this.logger.info('Event cache initialized')
    } catch (err) {
      this.logger.error(err, 'Failed to initialize event cache')
    }

    setInterval(
      async () => {
        try {
          this.logger.info('Event cache updating')
          for (const contractAddress of Array.from(this.cache.keys())) {
            await this.indexContractEvents(contractAddress)
          }
          this.logger.info('Event cache updated')
        } catch (err) {
          this.logger.error(err, 'Failed to update event cache')
        }
      },
      1000 * 60 * 15 // 15 minute update frequency
    )
  }

  private async indexContractEvents(contractAddress: Address) {
    const startBlock = this.cache.get(contractAddress)!.lastIndexedBlock
    const endBlock = await this.client.getBlockNumber()

    const events = await this.fetchEvents(contractAddress, startBlock, endBlock)

    const eventsByAddress = new Map(this.cache.get(contractAddress)!.eventsByAddress)
    events.forEach((event) => {
      const accountAddress = event.args.account!.toLowerCase()
      if (!eventsByAddress.has(accountAddress)) eventsByAddress.set(accountAddress, [])
      eventsByAddress.get(accountAddress)!.push(event)
    })

    this.cache.set(contractAddress, {
      eventsByAddress: eventsByAddress,
      lastIndexedBlock: endBlock,
    })

    this.logger.info(`Indexed ${events.length} events (${eventsByAddress.size} accounts) for ${contractAddress}`)
  }

  private async fetchEvents(contractAddress: Address, startBlock: bigint, endBlock: bigint): Promise<Array<Event>> {
    try {
      const events: Array<Event> = []

      this.logger.info(`Fetching events for ${contractAddress} from ${startBlock} to ${endBlock}`)

      for (const eventName of ['Stake', 'Unstake'] as const) {
        const contractEvents = await this.alchemyClient.getContractEvents({
          address: contractAddress,
          eventName,
          abi: RFOX_ABI,
          fromBlock: startBlock,
          toBlock: endBlock,
        })

        events.push(...contractEvents)
      }

      events.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber - b.blockNumber)
        return Number(a.logIndex - b.logIndex)
      })

      return events
    } catch (err) {
      this.logger.error(`Failed to fetch events for ${contractAddress} from ${startBlock} to ${endBlock}`)
      throw err
    }
  }

  async getStakingDuration(accountAddress: string): Promise<StakingDuration> {
    const stakingDurationByContract: StakingDuration = {}
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000))

    for (const [contractAddress, { eventsByAddress }] of this.cache.entries()) {
      const events = eventsByAddress.get(accountAddress.toLowerCase())

      if (!events?.length) {
        stakingDurationByContract[contractAddress] = 0
        continue
      }

      let stakingBalance = 0n
      let firstStakeBlock: bigint | undefined = undefined
      for (const log of events) {
        if (log.eventName === 'Stake') {
          stakingBalance += log.args.amount ?? 0n
          if (firstStakeBlock === undefined) firstStakeBlock = log.blockNumber
        }

        if (log.eventName === 'Unstake') {
          stakingBalance -= log.args.amount ?? 0n
          if (stakingBalance === 0n) firstStakeBlock = undefined
        }
      }

      if (stakingBalance > 0n && firstStakeBlock !== undefined) {
        const { timestamp } = await this.client.getBlock({ blockNumber: firstStakeBlock })
        stakingDurationByContract[contractAddress] = Number(currentTimestamp - timestamp)
      } else {
        stakingDurationByContract[contractAddress] = 0
      }
    }

    return stakingDurationByContract
  }
}
