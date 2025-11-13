import { Log, PublicClient, Address, parseAbi } from 'viem'

const FOX_PROXY_CONTRACT: Address = '0xaC2a4fD70BCD8Bab0662960455c363735f0e2b56'
const UNI_V2_ETH_FOX_PROXY_CONTRACT: Address = '0x83B51B7605d2E277E03A7D6451B1efc0e5253A2F'

const stakingContracts = [FOX_PROXY_CONTRACT, UNI_V2_ETH_FOX_PROXY_CONTRACT]

const [stakeEvent, unstakeEvent] = parseAbi([
  'event Staked(address indexed account, uint256 amount, uint256 timestamp)',
  'event Unstaked(address indexed account, uint256 amount, uint256 timestamp)',
])

export type RFOXAccountLog =
  | Log<bigint, number, false, typeof stakeEvent, false, [typeof stakeEvent], 'Staked'>
  | Log<bigint, number, false, typeof unstakeEvent, false, [typeof unstakeEvent], 'Unstaked'>

export type StakingDuration = Record<Address, number>

interface LogCache {
  logsByAccountAddress: Map<string, Array<RFOXAccountLog>>
  lastIndexedBlock: bigint
}

const getContractCreationBlockNumber = (address: Address) => {
  switch (address) {
    case FOX_PROXY_CONTRACT:
      return 222913582n
    case UNI_V2_ETH_FOX_PROXY_CONTRACT:
      return 291163572n
    default:
      throw new Error(`Invalid contract address`)
  }
}

export class EventCache {
  private client: PublicClient

  private cache: Map<Address, LogCache> = new Map(
    stakingContracts.map((address) => [
      address,
      {
        logsByAccountAddress: new Map(),
        lastIndexedBlock: getContractCreationBlockNumber(address),
      },
    ])
  )

  constructor(client: PublicClient) {
    this.client = client
  }

  async initialize() {
    const indexContracts = async () => {
      await Promise.all(
        Array.from(this.cache.keys()).map(async (contractAddress) => {
          try {
            await this.indexContract(contractAddress)
          } catch (err) {
            console.error(`Failed to index contract ${contractAddress}`)
            throw err
          }
        })
      )
    }

    try {
      console.log('Starting initial cache update')
      await indexContracts()
      console.log('Initial update complete')
    } catch (err) {
      console.log('Error during initial cache update:', err)
    }

    setInterval(
      async () => {
        try {
          console.log('Starting periodic cache update...')
          await indexContracts()
          console.log('Periodic update complete')
        } catch (err) {
          console.error('Error during periodic update:', err)
        }
      },
      1000 * 60 * 1
    )
  }

  private async indexContract(contractAddress: Address) {
    try {
      const startBlock = this.cache.get(contractAddress)!.lastIndexedBlock
      const endBlock = await this.client.getBlockNumber()

      console.log(`Indexing ${contractAddress} from block ${startBlock} to ${endBlock}`)

      const logs = await this.fetchLogs(contractAddress, startBlock, endBlock)

      const logsByAccountAddress = new Map(this.cache.get(contractAddress)!.logsByAccountAddress)
      logs.forEach((log) => {
        const accountAddress = log.args.account!.toLowerCase()
        if (!logsByAccountAddress.has(accountAddress)) logsByAccountAddress.set(accountAddress, [])
        logsByAccountAddress.get(accountAddress)!.push(log)
      })

      this.cache.set(contractAddress, {
        logsByAccountAddress,
        lastIndexedBlock: endBlock,
      })

      console.log(`✅ Indexed ${logs.length} events for ${logsByAccountAddress.size} accounts`)
    } catch (err) {
      console.log(`Failed to index ${contractAddress}`)
      throw err
    }
  }

  private async fetchLogs(
    contractAddress: Address,
    startBlock: bigint,
    endBlock: bigint
  ): Promise<Array<RFOXAccountLog>> {
    try {
      const batchSize = 10
      const chunkSize = 100n

      const chunks: Array<{ fromBlock: bigint; toBlock: bigint }> = []
      for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += chunkSize) {
        const toBlock = fromBlock + chunkSize - 1n > endBlock ? endBlock : fromBlock + chunkSize - 1n
        chunks.push({ fromBlock, toBlock })
      }

      const logs: Array<RFOXAccountLog> = []
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize)
        const batchNumber = Math.floor(i / batchSize) + 1
        const totalBatches = Math.ceil(chunks.length / batchSize)

        console.log(
          `Fetching batch ${batchNumber}/${totalBatches} (blocks ${batch[0].fromBlock} to ${
            batch[batch.length - 1].toBlock
          })`
        )

        const batchResults = await Promise.all(
          batch.map(async ({ fromBlock, toBlock }) => {
            const [stakes, unstakes] = await Promise.all(
              [stakeEvent, unstakeEvent].map((event) => {
                return this.client.getLogs({
                  address: contractAddress,
                  event,
                  fromBlock,
                  toBlock,
                }) as Promise<Array<RFOXAccountLog>>
              })
            )
            return [...stakes, ...unstakes]
          })
        )

        logs.push(...batchResults.flat())
      }

      logs.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber - b.blockNumber)
        return Number(a.logIndex - b.logIndex)
      })

      return logs
    } catch (err) {
      console.log(`Failed to fetch logs for ${contractAddress} from ${startBlock} to ${endBlock}`)
      throw err
    }
  }

  async getStakingDuration(accountAddress: string): Promise<StakingDuration> {
    const stakingDurationByContract: StakingDuration = {}
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000))

    for (const [contractAddress, logCache] of this.cache.entries()) {
      const logs = logCache.logsByAccountAddress.get(accountAddress.toLowerCase())

      if (!logs?.length) {
        stakingDurationByContract[contractAddress] = 0
        continue
      }

      let stakingBalance = 0n
      let firstStakeBlock: bigint | undefined = undefined
      for (const log of logs) {
        if (log.eventName === 'Staked') {
          stakingBalance += log.args.amount ?? 0n
          if (firstStakeBlock === undefined) firstStakeBlock = log.blockNumber
        }

        if (log.eventName === 'Unstaked') {
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
