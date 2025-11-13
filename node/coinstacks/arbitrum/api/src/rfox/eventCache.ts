import { PublicClient, Address, GetContractEventsReturnType } from 'viem'
import { RFOX_ABI } from './abi'

const FOX_PROXY_CONTRACT: Address = '0xaC2a4fD70BCD8Bab0662960455c363735f0e2b56'
const UNI_V2_ETH_FOX_PROXY_CONTRACT: Address = '0x83B51B7605d2E277E03A7D6451B1efc0e5253A2F'

export type StakingDuration = Record<Address, number>
export type Event = GetContractEventsReturnType<typeof RFOX_ABI, 'Stake' | 'Unstake'>[number]

interface Events {
  eventsByAddress: Map<string, Array<Event>>
  lastIndexedBlock: bigint
}

export class EventCache {
  private client: PublicClient

  private cache: Map<Address, Events> = new Map([
    [FOX_PROXY_CONTRACT, { eventsByAddress: new Map(), lastIndexedBlock: 222913582n }],
    [UNI_V2_ETH_FOX_PROXY_CONTRACT, { eventsByAddress: new Map(), lastIndexedBlock: 291163572n }],
  ])

  constructor(client: PublicClient) {
    this.client = client
  }

  async initialize() {
    const indexEvents = async () => {
      await Promise.all(
        Array.from(this.cache.keys()).map(async (contractAddress) => {
          await this.indexContractEvents(contractAddress)
        })
      )
    }

    try {
      console.log('Starting initial cache update')
      await indexEvents()
      console.log('Initial update complete')
    } catch (err) {
      console.log('Error during initial cache update:', err)
    }

    setInterval(
      async () => {
        try {
          console.log('Starting periodic cache update...')
          await indexEvents()
          console.log('Periodic update complete')
        } catch (err) {
          console.error('Error during periodic update:', err)
        }
      },
      1000 * 60 * 1
    )
  }

  private async indexContractEvents(contractAddress: Address) {
    try {
      const startBlock = this.cache.get(contractAddress)!.lastIndexedBlock
      const endBlock = await this.client.getBlockNumber()

      console.log(`Indexing ${contractAddress} from block ${startBlock} to ${endBlock}`)

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

      console.log(`✅ Indexed ${events.length} events for ${eventsByAddress.size} accounts`)
    } catch (err) {
      console.log(`Failed to index ${contractAddress}`)
      throw err
    }
  }

  private async fetchEvents(contractAddress: Address, startBlock: bigint, endBlock: bigint): Promise<Array<Event>> {
    try {
      const events: Array<Event> = []

      console.log(`Fetching events for ${contractAddress} from ${startBlock} to ${endBlock}`)

      const [stakeEvents, unstakeEvents] = await Promise.all(
        (['Stake', 'Unstake'] as const).map((eventName) => {
          return this.client.getContractEvents({
            address: contractAddress,
            eventName,
            abi: RFOX_ABI,
            fromBlock: startBlock,
            toBlock: endBlock,
          })
        })
      )

      events.push(...stakeEvents, ...unstakeEvents)

      events.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber - b.blockNumber)
        return Number(a.logIndex - b.logIndex)
      })

      return events
    } catch (err) {
      console.log(`Failed to fetch events for ${contractAddress} from ${startBlock} to ${endBlock}`)
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
