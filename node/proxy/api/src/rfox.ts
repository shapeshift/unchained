import { AsyncCache, createAxiosRetry } from '@shapeshiftoss/common-api'
import { Logger } from '@shapeshiftoss/logger'
import Bottleneck from 'bottleneck'
import { Request, Response } from 'express'
import { getAddress, isAddress } from 'viem'

const BLOCKSCOUT_API_KEY = process.env.BLOCKSCOUT_API_KEY
const RFOX_METADATA_IPFS_HASH = process.env.RFOX_METADATA_IPFS_HASH
const PINATA_GATEWAY_URL = process.env.PINATA_GATEWAY_URL
const PINATA_GATEWAY_API_KEY = process.env.PINATA_GATEWAY_API_KEY

if (!BLOCKSCOUT_API_KEY) throw new Error('BLOCKSCOUT_API_KEY env var not set')
if (!RFOX_METADATA_IPFS_HASH) throw new Error('RFOX_METADATA_IPFS_HASH env var not set')
if (!PINATA_GATEWAY_URL) throw new Error('PINATA_GATEWAY_URL env var not set')
if (!PINATA_GATEWAY_API_KEY) throw new Error('PINATA_GATEWAY_API_KEY env var not set')

const REQUEST_TIMEOUT_MS = 10_000
const REQUEST_RETRIES = 2
const CACHE_MAX_AGE_SECONDS = 3600
const BLOCKSCOUT_API_URL = 'https://api.blockscout.com/v2/api'
const ETHEREUM_CHAIN_ID = 1

type Metadata = {
  epoch: number
  epochStartTimestamp: number
  epochEndTimestamp: number
  burnRate: number
  distributionRateByStakingContract: Record<string, number>
  ipfsHashByEpoch: Record<string, string>
}

type ClosingBlock = {
  blockNumber: string
  timestamp: number
}

type RewardDistribution = {
  amount: string
  rewardUnits: string
  totalRewardUnits: string
  txId: string
  rewardAddress: string
}

type EpochDetails = {
  totalRewardUnits: string
  distributionRate: number
  distributionsByStakingAddress: Record<string, RewardDistribution>
}

type Epoch = {
  number: number
  startTimestamp: number
  endTimestamp: number
  startBlock: number
  endBlock: number
  totalRevenue: string
  burnRate: number
  distributionStatus: 'pending' | 'complete'
  detailsByStakingContract: Record<string, EpochDetails>
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isMetadata = (value: unknown): value is Metadata =>
  isRecord(value) &&
  isNumber(value.epoch) &&
  isNumber(value.epochStartTimestamp) &&
  isNumber(value.epochEndTimestamp) &&
  isNumber(value.burnRate) &&
  isRecord(value.distributionRateByStakingContract) &&
  Object.values(value.distributionRateByStakingContract).every(isNumber) &&
  isRecord(value.ipfsHashByEpoch) &&
  Object.values(value.ipfsHashByEpoch).every((hash) => isString(hash) && hash.length > 0)

const isRewardDistribution = (value: unknown): value is RewardDistribution =>
  isRecord(value) &&
  isString(value.amount) &&
  isString(value.rewardUnits) &&
  isString(value.totalRewardUnits) &&
  isString(value.txId) &&
  isString(value.rewardAddress)

const isEpochDetails = (value: unknown): value is EpochDetails =>
  isRecord(value) &&
  isString(value.totalRewardUnits) &&
  isNumber(value.distributionRate) &&
  isRecord(value.distributionsByStakingAddress) &&
  Object.values(value.distributionsByStakingAddress).every(isRewardDistribution)

const isEpoch = (value: unknown): value is Epoch =>
  isRecord(value) &&
  isNumber(value.number) &&
  isNumber(value.startTimestamp) &&
  isNumber(value.endTimestamp) &&
  isNumber(value.startBlock) &&
  isNumber(value.endBlock) &&
  isString(value.totalRevenue) &&
  isNumber(value.burnRate) &&
  (value.distributionStatus === 'pending' || value.distributionStatus === 'complete') &&
  isRecord(value.detailsByStakingContract) &&
  Object.values(value.detailsByStakingContract).every(isEpochDetails)

export class Rfox {
  private logger: Logger
  private limiter = new Bottleneck({ maxConcurrent: 4 })
  private ipfsCache = new Map<string, Promise<unknown>>()

  private closingBlockCache = new AsyncCache(
    async () => this.fetchClosingBlock((await this.getMetadata()).epochEndTimestamp),
    CACHE_MAX_AGE_SECONDS * 1000
  )

  private gateway = createAxiosRetry(
    { retries: REQUEST_RETRIES },
    {
      baseURL: `${PINATA_GATEWAY_URL}/ipfs`,
      headers: { 'x-pinata-gateway-token': PINATA_GATEWAY_API_KEY },
      timeout: REQUEST_TIMEOUT_MS,
    }
  )

  private blockscoutApi = createAxiosRetry(
    { retries: REQUEST_RETRIES },
    { baseURL: BLOCKSCOUT_API_URL, timeout: REQUEST_TIMEOUT_MS }
  )

  constructor(logger: Logger) {
    this.logger = logger.child({ namespace: ['rfox'] })

    this.getEpochs().catch((err) => this.logFailure(err, 'failed to warm rfox epoch cache'))
  }

  private logFailure(err: unknown, message: string) {
    this.logger.warn({ error: err instanceof Error ? err.message : String(err) }, message)
  }

  private sendError(res: Response, err: unknown) {
    this.logFailure(err, 'rfox request failed')
    res.status(502).json({ error: 'Upstream request failed' })
  }

  private async fetchFromGateway<T>(hash: string, isValid: (data: unknown) => data is T): Promise<T> {
    const { data } = await this.gateway.get<unknown>(hash)

    if (!isValid(data)) throw new Error(`Invalid ipfs content for ${hash}`)

    return data
  }

  private fetchIpfs<T>(hash: string, isValid: (data: unknown) => data is T): Promise<T> {
    const cached = this.ipfsCache.get(hash)
    if (cached) return cached as Promise<T>

    const request = this.limiter.schedule(() => this.fetchFromGateway(hash, isValid))
    this.ipfsCache.set(hash, request)
    request.catch(() => this.ipfsCache.delete(hash))

    return request
  }

  private getMetadata(): Promise<Metadata> {
    return this.fetchIpfs(RFOX_METADATA_IPFS_HASH as string, isMetadata)
  }

  private async getEpochs(): Promise<(Epoch & { ipfsHash: string })[]> {
    const { ipfsHashByEpoch } = await this.getMetadata()

    const epochs = await Promise.all(
      Object.values(ipfsHashByEpoch).map(async (ipfsHash) => ({
        ...(await this.fetchIpfs(ipfsHash, isEpoch)),
        ipfsHash,
      }))
    )

    return epochs.sort((a, b) => b.number - a.number)
  }

  private async blockscout<T>(params: Record<string, string | number>): Promise<Partial<T>> {
    const { data } = await this.blockscoutApi.get<{ status: string; result: T | null }>('', {
      params: { chain_id: ETHEREUM_CHAIN_ID, ...params, apikey: BLOCKSCOUT_API_KEY },
    })

    if (data.status !== '1' || !data.result) throw new Error('Failed to find closing block')

    return data.result
  }

  private async fetchClosingBlock(epochEndTimestamp: number): Promise<ClosingBlock> {
    const { blockNumber } = await this.blockscout<{ blockNumber: string }>({
      module: 'block',
      action: 'getblocknobytime',
      timestamp: Math.floor(epochEndTimestamp / 1000),
      closest: 'before',
    })

    if (!blockNumber || !/^\d+$/.test(blockNumber)) throw new Error('Invalid closing block number')

    const { timeStamp } = await this.blockscout<{ timeStamp: number | string }>({
      module: 'block',
      action: 'getblockreward',
      blockno: blockNumber,
    })

    const timestamp = Number(timeStamp)
    if (!isNumber(timestamp) || timestamp <= 0) throw new Error('Invalid closing block timestamp')

    return { blockNumber, timestamp }
  }

  async metadataHandler(_: Request, res: Response): Promise<void> {
    try {
      const metadata = await this.getMetadata()
      res.set('Cache-Control', `public, max-age=${CACHE_MAX_AGE_SECONDS}`).json(metadata)
    } catch (err) {
      this.sendError(res, err)
    }
  }

  async closingBlockHandler(req: Request, res: Response): Promise<void> {
    const chainId = Number(req.params.chainId)

    if (chainId !== ETHEREUM_CHAIN_ID) {
      res.status(422).json({ error: 'Unsupported chainId' })
      return
    }

    try {
      const { epochEndTimestamp } = await this.getMetadata()

      if (Date.now() <= epochEndTimestamp) {
        res.status(409).json({ error: 'Epoch has not ended' })
        return
      }

      const closingBlock = await this.closingBlockCache.get()

      res.set('Cache-Control', `public, max-age=${CACHE_MAX_AGE_SECONDS}`).json(closingBlock)
    } catch (err) {
      this.sendError(res, err)
    }
  }

  async epochsHandler(req: Request, res: Response): Promise<void> {
    const { address } = req.params

    if (!isAddress(address)) {
      res.status(422).json({ error: 'Invalid address' })
      return
    }

    const stakingAddress = getAddress(address)

    try {
      const epochs = (await this.getEpochs()).map((epoch) => ({
        ...epoch,
        detailsByStakingContract: Object.fromEntries(
          Object.entries(epoch.detailsByStakingContract).map(([stakingContract, details]) => {
            const distribution = details.distributionsByStakingAddress[stakingAddress]

            return [
              stakingContract,
              {
                ...details,
                distributionsByStakingAddress: distribution ? { [stakingAddress]: distribution } : {},
              },
            ]
          })
        ),
      }))

      res.set('Cache-Control', `public, max-age=${CACHE_MAX_AGE_SECONDS}`).json(epochs)
    } catch (err) {
      this.sendError(res, err)
    }
  }
}
