import axios from 'axios'
import { padHex, zeroAddress } from 'viem'
import { Fees } from '..'
import {
  getCacheableThreshold,
  getCachedTokenTransfer,
  getDateEndTimestamp,
  getDateStartTimestamp,
  groupFeesByDate,
  saveCachedFees,
  saveCachedTokenTransfer,
  splitDateRange,
  tryGetCachedFees,
} from '../cache'
import { CHAIN_CONFIGS, PORTAL_EVENT_SIGNATURE } from './constants'
import type {
  BlockscoutLogsResponse,
  BlockscoutTokenTransfersResponse,
  ChainConfig,
  EtherscanLogsResponse,
  EtherscanTokenTxResponse,
  PortalEventData,
  TokenTransfer,
} from './types'
import {
  buildAssetId,
  calculateFallbackFee,
  decodePortalEventData,
  getTokenDecimals,
  getTokenPrice,
  getTransactionTimestamp,
} from './utils'

const getPortalEventsBlockscout = async (
  config: ChainConfig,
  startTimestamp: number,
  endTimestamp: number
): Promise<PortalEventData[]> => {
  const events: PortalEventData[] = []
  const treasuryLower = config.treasury.toLowerCase()
  const txTimestampCache: Record<string, number> = {}

  let nextPageParams: BlockscoutLogsResponse['next_page_params'] = undefined
  let reachedStartTimestamp = false

  do {
    const params = new URLSearchParams()
    if (nextPageParams) {
      params.set('block_number', nextPageParams.block_number.toString())
      params.set('index', nextPageParams.index.toString())
    }

    const url = `${config.explorerUrl}/api/v2/addresses/${config.router}/logs?${params.toString()}`
    const { data } = await axios.get<BlockscoutLogsResponse>(url)

    for (const log of data.items) {
      if (!log.decoded?.parameters) continue

      const partnerParam = log.decoded.parameters.find((p) => p.name === 'partner')
      if (!partnerParam || partnerParam.value.toLowerCase() !== treasuryLower) continue

      let logTimestamp = txTimestampCache[log.transaction_hash]
      if (!logTimestamp) {
        logTimestamp = await getTransactionTimestamp(config.explorerUrl, log.transaction_hash)
        txTimestampCache[log.transaction_hash] = logTimestamp
      }

      if (logTimestamp < startTimestamp) {
        reachedStartTimestamp = true
        continue
      }
      if (logTimestamp > endTimestamp) continue

      const inputToken = log.decoded.parameters.find((p) => p.name === 'inputToken')?.value ?? ''
      const inputAmount = log.decoded.parameters.find((p) => p.name === 'inputAmount')?.value ?? '0'
      const outputToken = log.decoded.parameters.find((p) => p.name === 'outputToken')?.value ?? ''
      const outputAmount = log.decoded.parameters.find((p) => p.name === 'outputAmount')?.value ?? '0'

      events.push({
        txHash: log.transaction_hash,
        timestamp: logTimestamp,
        inputToken,
        inputAmount,
        outputToken,
        outputAmount,
      })
    }

    if (reachedStartTimestamp && data.items.length > 0) {
      nextPageParams = undefined
    } else {
      nextPageParams = data.next_page_params
    }
  } while (nextPageParams)

  return events
}

const getFeeTransferBlockscout = async (config: ChainConfig, txHash: string): Promise<TokenTransfer | null> => {
  const treasuryLower = config.treasury.toLowerCase()

  const url = `${config.explorerUrl}/api/v2/transactions/${txHash}/token-transfers`
  const { data } = await axios.get<BlockscoutTokenTransfersResponse>(url)

  for (const transfer of data.items) {
    const toAddress = transfer.to?.hash
    if (!toAddress) continue

    if (toAddress.toLowerCase() === treasuryLower) {
      const tokenAddress = transfer.token?.address_hash
      if (!tokenAddress) continue

      return {
        token: tokenAddress,
        amount: transfer.total?.value ?? '0',
        decimals: parseInt(transfer.total?.decimals ?? '18'),
        symbol: transfer.token?.symbol ?? 'UNKNOWN',
      }
    }
  }

  return null
}

const getPortalEventsEtherscan = async (
  config: ChainConfig,
  startTimestamp: number,
  endTimestamp: number
): Promise<PortalEventData[]> => {
  const events: PortalEventData[] = []
  const treasuryTopic = padHex(config.treasury.toLowerCase() as `0x${string}`, { size: 32 })

  const url = `${config.explorerUrl}/api`
  const { data } = await axios.get<EtherscanLogsResponse>(url, {
    params: {
      module: 'logs',
      action: 'getLogs',
      address: config.router,
      topic0: PORTAL_EVENT_SIGNATURE,
      topic0_3_opr: 'and',
      topic3: treasuryTopic,
      fromBlock: 0,
      toBlock: 'latest',
      sort: 'desc',
    },
  })

  if (data.status !== '1' || !Array.isArray(data.result)) {
    return events
  }

  for (const log of data.result) {
    const logTimestamp = parseInt(log.timeStamp, 16)
    if (logTimestamp < startTimestamp) break
    if (logTimestamp > endTimestamp) continue

    const decoded = decodePortalEventData(log.data)
    if (!decoded) continue

    events.push({
      txHash: log.transactionHash,
      timestamp: logTimestamp,
      inputToken: decoded.inputToken,
      inputAmount: decoded.inputAmount,
      outputToken: decoded.outputToken,
      outputAmount: decoded.outputAmount,
    })
  }

  return events
}

const getFeeTransferEtherscan = async (config: ChainConfig, txHash: string): Promise<TokenTransfer | null> => {
  const treasuryLower = config.treasury.toLowerCase()

  const url = `${config.explorerUrl}/api`
  const { data } = await axios.get<EtherscanTokenTxResponse>(url, {
    params: {
      module: 'account',
      action: 'tokentx',
      txhash: txHash,
    },
  })

  if (data.status !== '1' || !Array.isArray(data.result)) {
    return null
  }

  for (const transfer of data.result) {
    if (transfer.to.toLowerCase() === treasuryLower) {
      return {
        token: transfer.contractAddress,
        amount: transfer.value,
        decimals: parseInt(transfer.tokenDecimal),
        symbol: transfer.tokenSymbol,
      }
    }
  }

  return null
}

const constructFeeFromEvent = async (config: ChainConfig, event: PortalEventData): Promise<Fees | null> => {
  try {
    const cacheKey = `${config.chainId}:${event.txHash}`
    const cached = getCachedTokenTransfer(cacheKey)

    const feeTransfer =
      cached !== undefined
        ? cached
        : await (async () => {
            try {
              const transfer =
                config.explorerType === 'blockscout'
                  ? await getFeeTransferBlockscout(config, event.txHash)
                  : await getFeeTransferEtherscan(config, event.txHash)
              saveCachedTokenTransfer(cacheKey, transfer)
              return transfer
            } catch {
              saveCachedTokenTransfer(cacheKey, null)
              return null
            }
          })()

    if (feeTransfer) {
      const assetId = buildAssetId(config.chainId, feeTransfer.token ?? zeroAddress)
      const amountDecimal = Number(feeTransfer.amount) / 10 ** feeTransfer.decimals
      const price = await getTokenPrice(config.chainId, feeTransfer.token ?? '')
      const amountUsd = price ? (amountDecimal * price).toString() : undefined

      return {
        chainId: config.chainId,
        assetId,
        service: 'portals',
        txHash: event.txHash,
        timestamp: event.timestamp,
        amount: feeTransfer.amount,
        amountUsd,
      }
    } else {
      const inputToken = event.inputToken ?? zeroAddress
      const assetId = buildAssetId(config.chainId, inputToken)
      const decimals = await getTokenDecimals(config.explorerUrl, config.explorerType, inputToken)
      const feeWei = calculateFallbackFee(event.inputAmount)
      const feeDecimal = Number(feeWei) / 10 ** decimals
      const price = await getTokenPrice(config.chainId, inputToken)
      const amountUsd = price ? (feeDecimal * price).toString() : undefined

      return {
        chainId: config.chainId,
        assetId,
        service: 'portals',
        txHash: event.txHash,
        timestamp: event.timestamp,
        amount: feeWei,
        amountUsd,
      }
    }
  } catch {
    return null
  }
}

const fetchFeesForChain = async (config: ChainConfig, startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const events =
    config.explorerType === 'blockscout'
      ? await getPortalEventsBlockscout(config, startTimestamp, endTimestamp)
      : await getPortalEventsEtherscan(config, startTimestamp, endTimestamp)

  const feePromises = events.map(event => constructFeeFromEvent(config, event))
  const feeResults = await Promise.allSettled(feePromises)

  const fees = feeResults
    .filter((r): r is PromiseFulfilledResult<Fees | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((fee): fee is Fees => fee !== null)

  return fees.sort((a, b) => b.timestamp - a.timestamp)
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const allFees: Fees[] = []
  const threshold = getCacheableThreshold()
  const { cacheableDates, recentStart } = splitDateRange(startTimestamp, endTimestamp, threshold)

  const results = await Promise.allSettled(
    CHAIN_CONFIGS.map(async (config) => {
      const cachedFees: Fees[] = []
      const datesToFetch: string[] = []

      for (const date of cacheableDates) {
        const cached = tryGetCachedFees('portals', config.chainId, date)
        if (cached) {
          cachedFees.push(...cached)
        } else {
          datesToFetch.push(date)
        }
      }

      const newFees: Fees[] = []
      if (datesToFetch.length > 0) {
        const fetchStart = getDateStartTimestamp(datesToFetch[0])
        const fetchEnd = getDateEndTimestamp(datesToFetch[datesToFetch.length - 1])
        const fetched = await fetchFeesForChain(config, fetchStart, fetchEnd)

        const feesByDate = groupFeesByDate(fetched)
        for (const date of datesToFetch) {
          saveCachedFees('portals', config.chainId, date, feesByDate[date] || [])
        }
        newFees.push(...fetched)
      }

      const recentFees: Fees[] = []
      if (recentStart !== null) {
        recentFees.push(...(await fetchFeesForChain(config, recentStart, endTimestamp)))
      }

      return [...cachedFees, ...newFees, ...recentFees]
    })
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allFees.push(...result.value)
    }
  }

  return allFees
}
