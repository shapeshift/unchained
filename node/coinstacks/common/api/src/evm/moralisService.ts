import { EvmChain } from '@moralisweb3/common-evm-utils'
import { EvmStreamResult } from '@moralisweb3/common-streams-utils'
import { Logger } from '@shapeshiftoss/logger'
import { AddressSubscriptionClient } from '@shapeshiftoss/websocket'
import axios from 'axios'
import BigNumber from 'bignumber.js'
import Moralis from 'moralis'
import PQueue from 'p-queue'
import { getAddress, isHex, parseUnits, PublicClient, toHex } from 'viem'
import type { BaseAPI, EstimateGasBody, RPCRequest, RPCResponse, SendTxBody } from '..'
import { ApiError, BadRequestError } from '..'
import { createAxiosRetry, exponentialDelay, handleError, rpcId, validatePageSize } from '../utils'
import type { Account, API, Tx, TxHistory, GasFees, InternalTx, GasEstimate } from './models'
import { Fees, TokenBalance, TokenTransfer } from './models'
import type { ExplorerApiResponse, ExplorerInternalTxByAddress, TraceCall } from './types'
import { formatAddress } from '.'

const INDEXER_URL = process.env.INDEXER_URL as string
const INDEXER_API_KEY = process.env.INDEXER_API_KEY as string
const ENVIRONMENT = process.env.ENVIRONMENT as string
const WEBHOOK_URL = process.env.WEBHOOK_URL as string

const axiosNoRetry = axios.create({ timeout: 5000 })
const axiosWithRetry = createAxiosRetry({}, { timeout: 10000 })

// number of historical blocks to sample when estimating priority fees
const FEE_HISTORY_BLOCK_COUNT = 100

// reward percentiles used to estimate [slow, average, fast] priority fees respectively
const REWARD_PERCENTILES = [50, 70, 90]

// default per-tier multipliers [slow, average, fast] for base fee
const DEFAULT_BASE_FEE_MULTIPLIER: [number, number, number] = [2, 2, 2]

// default per-tier multipliers [slow, average, fast] for gas price
const DEFAULT_GAS_PRICE_MULTIPLIER: [number, number, number] = [1, 1, 1]

// drop priority fees above the median by this factor to keep outliers (mev/overpayers) from skewing estimates
const OUTLIER_THRESHOLD_MULTIPLIER = 10

// moralis caps adding addresses to a stream at 5 requests per 5 minutes, removals are not rate limited
// https://docs.moralis.com/streams/streams-concepts/rate-limits
const STREAM_ADD_LIMIT = 5
const STREAM_ADD_WINDOW = 300_000
const STREAM_ADD_INTERVAL = STREAM_ADD_WINDOW / STREAM_ADD_LIMIT
const STREAM_REMOVE_INTERVAL = 60_000
const STREAM_RETRY_INTERVAL = 5_000

// moralis wraps request failures in a CoreError, exposing the http status on details
const isRateLimitError = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false
  const { details } = err as { details?: { status?: number } }
  return details?.status === 429
}

type TransactionHandler = (tx: Tx) => Promise<void>

interface Cursor {
  blockHeight?: number
  moralisCursor?: string
  moralisTxid?: string
  explorerPage: number
  explorerTxid?: string
}

export interface MoralisServiceArgs {
  chain: EvmChain
  logger: Logger
  client: PublicClient
  rpcUrl: string
  explorerApiUrl?: URL
  minPriorityFee?: string
  baseFeeMultiplier?: [number, number, number]
  gasPriceMultiplier?: [number, number, number]
}

export class MoralisService implements Omit<BaseAPI, 'getInfo'>, API, AddressSubscriptionClient {
  private readonly chain: EvmChain
  private readonly logger: Logger
  private readonly client: PublicClient
  private readonly rpcUrl: string
  private readonly explorerApiUrl: URL
  private readonly minPriorityFee: string
  private readonly baseFeeMultiplier: [number, number, number]
  private readonly gasPriceMultiplier: [number, number, number]

  private secret?: string
  private streamId?: string
  private queue = new PQueue({ concurrency: 1 })
  private currentAddresses = new Set<string>()
  private streamAddresses = new Set<string>()
  private nextStreamAdd = 0
  private nextStreamRemove = 0
  private nextStreamUpdate = 0

  transactionHandler?: TransactionHandler

  constructor(args: MoralisServiceArgs) {
    if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
    if (!INDEXER_API_KEY) throw new Error('INDEXER_API_KEY env var not set')
    if (!WEBHOOK_URL) throw new Error('WEBHOOK_URL env var not set')
    if (!ENVIRONMENT) throw new Error('ENVIRONMENT env var not set')

    this.chain = args.chain
    this.logger = args.logger.child({ namespace: ['moralisService'] })
    this.client = args.client
    this.rpcUrl = args.rpcUrl
    this.explorerApiUrl = args.explorerApiUrl ?? new URL('about:blank')
    this.minPriorityFee = args.minPriorityFee ?? '0'
    this.baseFeeMultiplier = args.baseFeeMultiplier ?? DEFAULT_BASE_FEE_MULTIPLIER
    this.gasPriceMultiplier = args.gasPriceMultiplier ?? DEFAULT_GAS_PRICE_MULTIPLIER

    void Moralis.start({ evmApiBaseUrl: INDEXER_URL, apiKey: INDEXER_API_KEY })

    this.queue.add(() => this.initializeStream()).catch(() => undefined)

    setInterval(() => {
      this.queue.add(() => this.updateStream()).catch(() => undefined)
    }, STREAM_RETRY_INTERVAL)
  }

  private async initializeStream() {
    const args = {
      chains: [this.chain],
      description: this.chain.display(),
      tag: `${this.chain.display()} - ${ENVIRONMENT}`,
      webhookUrl: WEBHOOK_URL,
      includeNativeTxs: true,
      includeInternalTxs: true,
      includeContractLogs: true,
      networkType: 'evm' as const,
    }

    try {
      // region is a request rather than local config, so it is applied and retried alongside the stream
      await Moralis.Streams.setSettings({ region: 'us-east-1' })

      const existing = await Moralis.Streams.add(args)

      await Moralis.Streams.delete({ id: existing.result.id, networkType: 'evm' })

      const stream = await Moralis.Streams.add(args)

      this.streamId = stream.result.id
      this.streamAddresses = new Set()
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error({ error: err.message }, 'failed to initialize stream')
      } else {
        this.logger.error('failed to initialize stream')
      }

      throw err
    }
  }

  async getSecret() {
    if (!this.secret) {
      const { data } = await axios.get<{ secretKey: string }>('https://api.moralis-streams.com/settings', {
        headers: { 'X-API-Key': INDEXER_API_KEY },
      })

      this.secret = data.secretKey
    }

    return this.secret
  }

  async getAccount(pubkey: string): Promise<Account> {
    try {
      let response = await Moralis.EvmApi.wallets.getWalletTokenBalancesPrice({
        chain: this.chain,
        address: pubkey,
        excludeSpam: true,
      })

      const result = response.result
      while (response.hasNext()) {
        response = await response.next()
        result.push(...response.result)
      }

      const balance = result.find((data) => data.nativeToken)?.balance.wei ?? '0'

      const tokens = result
        .filter((data) => !data.nativeToken)
        .reduce<Array<TokenBalance>>((prev, token) => {
          if (token.tokenAddress) {
            prev.push({
              balance: token.balance.wei,
              contract: token.tokenAddress?.checksum,
              decimals: token.decimals,
              name: token.name,
              symbol: token.symbol,
              type: 'ERC20',
            })
          }
          return prev
        }, [])

      return {
        balance,
        unconfirmedBalance: '0',
        nonce: await this.client.getTransactionCount({ address: getAddress(pubkey) }),
        pubkey,
        tokens,
      }
    } catch (err) {
      throw handleError(err)
    }
  }

  async getTxHistory(pubkey: string, cursor?: string, pageSize = 10, from?: number, to?: number): Promise<TxHistory> {
    validatePageSize(pageSize)

    try {
      const currentBlock = await this.client.getBlockNumber()

      const moralis = await this.getTxs(
        pubkey,
        { explorerPage: 0, moralisCursor: cursor },
        currentBlock,
        pageSize,
        from,
        to
      )

      if (!moralis.txs.size) return { pubkey: pubkey, txs: [] }

      return { pubkey, cursor: moralis.cursor, txs: Array.from(moralis.txs.values()) }
    } catch (err) {
      throw handleError(err)
    }
  }

  async getTxHistoryWithEtherscanInternalTxs(
    pubkey: string,
    cursor?: string,
    pageSize = 10,
    from?: number,
    to?: number
  ): Promise<TxHistory> {
    validatePageSize(pageSize)

    const curCursor = ((): Cursor => {
      try {
        if (!cursor) return { explorerPage: 1 }

        return JSON.parse(Buffer.from(cursor, 'base64').toString('binary'))
      } catch (err) {
        const e: BadRequestError = { error: `invalid base64 cursor: ${cursor}` }
        throw new ApiError('Bad Request', 422, JSON.stringify(e))
      }
    })()

    try {
      const currentBlock = await this.client.getBlockNumber()

      let moralis = await this.getTxs(pubkey, curCursor, currentBlock, pageSize, from, to)
      let internal = await this.getInternalTxs(pubkey, curCursor, pageSize, from, to)

      if (!moralis.txs.size && !internal.txs.size) return { pubkey: pubkey, txs: [] }

      const txs: Array<Tx> = []
      for (let i = 0; i < pageSize; i++) {
        if (!moralis.txs.size && moralis.hasMore) {
          curCursor.moralisCursor = moralis.cursor
          moralis = await this.getTxs(pubkey, curCursor, currentBlock, pageSize, from, to)
        }

        if (!internal.txs.size && internal.hasMore) {
          curCursor.explorerPage++
          internal = await this.getInternalTxs(pubkey, curCursor, pageSize, from, to)
        }

        if (!internal.txs.size && !moralis.txs.size) break

        const [internalTx] = internal.txs.values()
        const [moralisTx] = moralis.txs.values()

        if (moralisTx && moralisTx.blockHeight >= (internalTx?.blockHeight ?? -2)) {
          txs.push({ ...moralisTx, internalTxs: internal.txs.get(moralisTx.txid)?.txs })

          moralis.txs.delete(moralisTx.txid)
          curCursor.moralisTxid = moralisTx.txid
          curCursor.blockHeight = moralisTx.blockHeight

          // if there was a matching internal tx, delete it and track as last internal txid seen
          if (internal.txs.has(moralisTx.txid)) {
            internal.txs.delete(moralisTx.txid)
            curCursor.explorerTxid = moralisTx.txid
          }
        } else {
          try {
            const moralisTx = moralis.txs.get(internalTx.txid) ?? (await this.getTransaction(internalTx.txid))

            txs.push({ ...moralisTx, internalTxs: internalTx.txs })
          } catch (err) {
            this.logger.warn(err, `failed to get tx: ${internalTx.txid}`)
          }

          internal.txs.delete(internalTx.txid)
          curCursor.explorerTxid = internalTx.txid
          curCursor.blockHeight = internalTx.blockHeight

          // if there was a matching moralis tx, delete it and track as last moralis txid seen
          if (moralis.txs.has(internalTx.txid)) {
            moralis.txs.delete(internalTx.txid)
            curCursor.moralisTxid = internalTx.txid
          }
        }
      }

      // if we processed through the whole set of transactions, update cursor/page for next fetch
      if (!moralis.txs.size) curCursor.moralisCursor = moralis.cursor
      if (!internal.txs.size) curCursor.explorerPage++

      curCursor.blockHeight = txs[txs.length - 1]?.blockHeight

      const nextCursor = (() => {
        if (!moralis.txs.size && !moralis.hasMore) return
        if (!internal.txs.size && !internal.hasMore) return
        return Buffer.from(JSON.stringify(curCursor), 'binary').toString('base64')
      })()

      return { pubkey, cursor: nextCursor, txs }
    } catch (err) {
      throw handleError(err)
    }
  }

  async getTransaction(txid: string): Promise<Tx> {
    try {
      const data = await Moralis.EvmApi.transaction.getTransaction({
        chain: this.chain,
        transactionHash: txid,
        include: 'internal_transactions',
      })

      if (!data) throw new Error(`Transaction ${txid} not found`)

      const currentBlock = await this.client.getBlockNumber()

      const tx = data.result

      const internalTxs = tx.internalTransactions?.map<InternalTx>((tx) => ({
        from: tx.from.checksum,
        to: tx.to.checksum,
        value: tx.value.toString(),
      }))

      return {
        txid: tx.hash,
        blockHash: tx.blockHash,
        blockHeight: Number(tx.blockNumber.toString()),
        timestamp: Math.floor(tx.blockTimestamp.getTime() / 1000),
        status: Number(tx.receiptStatus),
        confirmations: Number(currentBlock - tx.blockNumber.toBigInt() + 1n),
        from: tx.from.checksum,
        to: tx.to?.checksum ?? '',
        value: tx.value?.wei ?? '0',
        inputData: tx.data,
        fee: BigNumber(tx.transactionFee ?? '0')
          .times(1e18)
          .toFixed(0),
        gasLimit: tx.gas?.toString() ?? '0',
        gasPrice: tx.gasPrice.toString(),
        gasUsed: tx.gasUsed.toString(),
        //tokenTransfers: tokenTransfers.length ? tokenTransfers : undefined,
        internalTxs: internalTxs?.length ? internalTxs : undefined,
      }
    } catch (err) {
      throw handleError(err)
    }
  }

  async estimateGas(body: EstimateGasBody): Promise<GasEstimate> {
    const { data, from, to, value } = body

    try {
      const gasLimit = await this.client.estimateGas({
        account: getAddress(from),
        to: getAddress(to),
        data: isHex(data) ? data : toHex(data),
        value: parseUnits(value, 0),
      })
      return { gasLimit: gasLimit.toString() }
    } catch (err) {
      throw handleError(err)
    }
  }

  async getGasFees(): Promise<GasFees> {
    try {
      const feeHistory = await this.client.getFeeHistory({
        blockCount: FEE_HISTORY_BLOCK_COUNT,
        rewardPercentiles: REWARD_PERCENTILES,
      })

      // the last entry is the base fee for the next block, calculated deterministically by the protocol
      const baseFeePerGas = BigNumber(feeHistory.baseFeePerGas[feeHistory.baseFeePerGas.length - 1].toString())

      const rewards = feeHistory.reward ?? []

      // average the priority fee at the given percentile index across all sampled blocks, ignoring empty blocks
      // and clipping outliers above median * OUTLIER_THRESHOLD_MULTIPLIER so a few high tips don't skew the estimate
      const estimatePriorityFee = (index: number): BigNumber => {
        const fees = rewards
          .map((reward) => BigNumber((reward[index] ?? 0n).toString()))
          .filter((fee) => fee.gt(0))
          .sort((a, b) => a.comparedTo(b))

        if (!fees.length) return BigNumber(0)

        const mid = Math.floor(fees.length / 2)
        const median = fees.length % 2 === 0 ? fees[mid - 1].plus(fees[mid]).div(2) : fees[mid]
        const threshold = median.times(OUTLIER_THRESHOLD_MULTIPLIER)

        const filtered = fees.filter((fee) => fee.lte(threshold))

        return filtered.reduce((sum, fee) => sum.plus(fee), BigNumber(0)).div(filtered.length).integerValue()
      }

      let maxPriorityFeePerGas = BigNumber(this.minPriorityFee)
      const [slow, average, fast] = REWARD_PERCENTILES.map((_, index): Fees => {
        maxPriorityFeePerGas = BigNumber.max(estimatePriorityFee(index), maxPriorityFeePerGas)
        const maxFeePerGas = baseFeePerGas.times(this.baseFeeMultiplier[index]).plus(maxPriorityFeePerGas)
        const gasPrice = baseFeePerGas.times(this.gasPriceMultiplier[index]).plus(maxPriorityFeePerGas)

        return {
          gasPrice: gasPrice.toFixed(0),
          maxFeePerGas: maxFeePerGas.toFixed(0),
          maxPriorityFeePerGas: maxPriorityFeePerGas.toFixed(0),
        }
      })

      return {
        baseFeePerGas: baseFeePerGas.toFixed(0),
        slow,
        average,
        fast,
      }
    } catch (err) {
      throw handleError(err)
    }
  }

  async sendTx(body: SendTxBody): Promise<string> {
    try {
      const request: RPCRequest = {
        jsonrpc: '2.0',
        id: rpcId(),
        method: 'eth_sendRawTransaction',
        params: [body.hex],
      }

      const { data } = await axiosNoRetry.post<RPCResponse>(this.rpcUrl, request, { timeout: 0 })

      if (!data.result) throw new Error(JSON.stringify(data.error))

      return data.result as string
    } catch (err) {
      throw handleError(err)
    }
  }

  getAddresses(tx: Tx): Array<string> {
    const addresses = new Set<string>()

    if (tx.from) addresses.add(tx.from)
    if (tx.to) addresses.add(tx.to)

    tx.tokenTransfers?.forEach((transfer) => {
      if (transfer.from) addresses.add(transfer.from)
      if (transfer.to) addresses.add(transfer.to)
    })

    tx.internalTxs?.forEach((internal) => {
      if (internal.from) addresses.add(internal.from)
      if (internal.to) addresses.add(internal.to)
    })

    return Array.from(addresses)
  }

  async handleStreamResult(result: EvmStreamResult): Promise<Array<Tx>> {
    const txs: Record<string, Tx> = {}

    const currentBlock = await this.client.getBlockNumber()

    this.logger.debug({ result }, 'handleStreamResult')

    await Promise.allSettled(
      result.txs.map(async (tx) => {
        const getTransaction = async (retryCount = 0) => {
          try {
            const transaction = await Moralis.EvmApi.transaction.getTransaction({
              chain: this.chain,
              transactionHash: tx.hash,
            })

            this.logger.debug({ retryCount, tx: transaction?.raw }, 'getTransaction')

            if (!transaction) throw Error()

            return transaction
          } catch (err) {
            if (++retryCount >= 5) throw new Error(`failed to get transaction: ${tx.hash}`)
            await exponentialDelay(retryCount, 1_000)
            return getTransaction(retryCount)
          }
        }

        const transaction = await getTransaction()

        txs[tx.hash] = {
          blockHash: result.block.hash,
          blockHeight: Number(result.block.number.toString()),
          timestamp: Number(result.block.timestamp),
          confirmations: Number(currentBlock - result.block.number.toBigInt() + 1n),
          fee: BigNumber(transaction.result.transactionFee ?? '0')
            .times(1e18)
            .toFixed(0),
          from: tx.fromAddress.checksum,
          to: tx.toAddress?.checksum ?? '',
          gasLimit: tx.gas?.toString() ?? '',
          gasPrice: tx.gasPrice?.toString() ?? '',
          status: tx.receiptStatus ?? 0,
          txid: tx.hash,
          value: tx.value?.toString() ?? '0',
          gasUsed: tx.receiptGasUsed?.toString() ?? '0',
          inputData: tx.input ?? '0x',
        }
      })
    )

    result.erc20Transfers.forEach((transfer) => {
      const tx = txs[transfer.transactionHash]
      if (!tx) return

      if (!tx.tokenTransfers) tx.tokenTransfers = []

      tx.tokenTransfers.push({
        contract: transfer.contract.checksum,
        decimals: transfer.tokenDecimals ?? 0,
        from: transfer.from.checksum,
        name: transfer.tokenName,
        symbol: transfer.tokenSymbol,
        to: transfer.to.checksum,
        type: 'ERC20',
        value: transfer.value.toString(),
      })
    })

    result.txsInternal.forEach((internal) => {
      if (!internal.value) return

      const tx = txs[internal.transactionHash]
      if (!tx) return

      if (!tx.internalTxs) tx.internalTxs = []

      tx.internalTxs.push({
        from: internal.from?.checksum ?? '',
        to: internal.to?.checksum ?? '',
        value: internal.value?.toString(),
      })
    })

    return Object.values(txs)
  }

  async handleStreamResultWithInternalTrace(result: EvmStreamResult): Promise<Array<Tx>> {
    const txs = await this.handleStreamResult(result)

    for (const tx of txs) {
      // don't trace pending transactions as they have no committed state to trace
      // don't trace transaction if there is not input data that would potentially result in an internal transaction
      if (tx.confirmations === 0 || !tx.inputData) continue

      // allow transaction to be handled even if we fail to get internal transactions (some better than none)
      const internalTxs = await (async () => {
        try {
          return await this.fetchInternalTxsByTxTrace(tx.txid)
        } catch (err) {
          return undefined
        }
      })()

      tx.internalTxs = internalTxs
    }

    return txs
  }

  private async fetchInternalTxsByTxTrace(txid: string, retryCount = 0): Promise<Array<InternalTx> | undefined> {
    const request: RPCRequest = {
      jsonrpc: '2.0',
      id: rpcId(),
      method: 'trace_transaction',
      params: [txid],
    }

    const { data } = await axiosWithRetry.post<RPCResponse>(this.rpcUrl, request)

    if (!data.result) {
      if (++retryCount >= 5)
        throw new Error(`failed to get internalTransactions for txid: ${txid}: ${data.error?.message}`)
      await exponentialDelay(retryCount)
      return this.fetchInternalTxsByTxTrace(txid, retryCount)
    }

    const callStack = data.result as Array<TraceCall>
    const txs = this.processCallStackTrace(callStack)[txid]

    return txs?.length ? txs : undefined
  }

  private processCallStackTrace(callStack: Array<TraceCall>): Record<string, Array<InternalTx> | undefined> {
    return callStack.reduce<Record<string, Array<InternalTx>>>((prev, call) => {
      if (!prev[call.transactionHash]) prev[call.transactionHash] = []

      const value = new BigNumber(call.action.value ?? 0)
      const gas = new BigNumber(call.action.gas)

      if (!(value.gt(0) && gas.gt(0))) return prev

      prev[call.transactionHash].push({
        from: formatAddress(call.action.from),
        to: formatAddress(call.action.to),
        value: value.toString(),
      })

      return prev
    }, {})
  }

  private async getInternalTxs(
    address: string,
    cursor: Cursor,
    pageSize: number,
    from?: number,
    to?: number
  ): Promise<{
    hasMore: boolean
    txs: Map<string, { blockHeight: number; txid: string; txs: Array<InternalTx> }>
  }> {
    const internalTxs = await this.fetchInternalTxsByAddress(address, cursor.explorerPage, pageSize, from, to)

    const data = new Map<string, { blockHeight: number; txid: string; txs: Array<InternalTx> }>()

    if (!internalTxs?.length) return { hasMore: false, txs: data }

    let doneFiltering = false
    const filteredInternalTxs = internalTxs.reduce((prev, internalTx) => {
      if (!internalTx.value || internalTx.value === '0') return prev

      if (!doneFiltering && cursor.blockHeight && cursor.explorerTxid) {
        // skip any transactions from blocks that we have already returned
        if (Number(internalTx.blockNumber) > cursor.blockHeight) return prev

        // skip any transaction that we have already returned within the same block
        // this assumes transactions are ordered in the same position within the block on every request
        if (Number(internalTx.blockNumber) === cursor.blockHeight) {
          if (cursor.explorerTxid === internalTx.hash) doneFiltering = true
          return prev
        }
      }

      const formattedInternalTx: InternalTx = {
        from: formatAddress(internalTx.from),
        to: formatAddress(internalTx.to),
        value: internalTx.value,
      }

      prev.set(internalTx.hash, {
        blockHeight: Number(internalTx.blockNumber),
        txid: internalTx.hash,
        txs: [...(prev.get(internalTx.hash)?.txs ?? []), formattedInternalTx],
      })

      return prev
    }, data)

    // if no txs exist after filtering out already seen transactions, fetch the next page
    if (!filteredInternalTxs.size) {
      cursor.explorerPage++
      return this.getInternalTxs(address, cursor, pageSize, from, to)
    }

    return {
      hasMore: internalTxs.length < pageSize ? false : true,
      txs: filteredInternalTxs,
    }
  }

  private async fetchInternalTxsByAddress(
    address: string,
    page: number,
    pageSize: number,
    from?: number,
    to?: number
  ): Promise<Array<ExplorerInternalTxByAddress> | undefined> {
    const url = new URL(this.explorerApiUrl.toString())

    url.searchParams.append('module', 'account')
    url.searchParams.append('action', 'txlistinternal')
    url.searchParams.append('address', address)
    url.searchParams.append('page', page.toString())
    url.searchParams.append('offset', pageSize.toString())
    url.searchParams.append('sort', 'desc')

    if (from) url.searchParams.append('startblock', from.toString())
    if (to) url.searchParams.append('endblock', to.toString())

    const { data } = await axiosWithRetry.get<ExplorerApiResponse<Array<ExplorerInternalTxByAddress>>>(url.toString())

    if (data.status === '0') return []

    return data.result
  }

  async getTxs(
    pubkey: string,
    cursor: Cursor,
    currentBlock: bigint,
    pageSize: number,
    from?: number,
    to?: number
  ): Promise<{ cursor?: string; hasMore: boolean; txs: Map<string, Tx> }> {
    const { pagination, result } = await Moralis.EvmApi.wallets.getWalletHistory({
      address: pubkey,
      chain: this.chain,
      cursor: cursor.moralisCursor,
      fromBlock: from,
      includeInputData: true,
      includeInternalTransactions: true,
      limit: pageSize,
      order: 'DESC',
      toBlock: to,
    })

    if (!result.length) return { hasMore: false, txs: new Map<string, Tx>() }

    let doneFiltering = false
    const txs = result.reduce((prev, tx) => {
      if (!doneFiltering && cursor.blockHeight && cursor.moralisTxid) {
        // skip any transactions from blocks that we have already returned
        if (cursor.blockHeight >= 0 && tx.blockNumber.toBigInt() > cursor.blockHeight) return prev

        // skip any transaction that we have already returned within the same block
        // this assumes transactions are ordered the same (by nonce) on every request
        if (Number(tx.blockNumber.toBigInt()) === cursor.blockHeight) {
          if (cursor.moralisTxid === tx.hash) doneFiltering = true
          return prev
        }
      }

      const tokenTransfers = tx.possibleSpam
        ? []
        : tx.erc20Transfers.map<TokenTransfer>((transfer) => ({
            from: transfer.fromAddress.checksum,
            to: transfer.toAddress?.checksum ?? '',
            value: transfer.value,
            contract: transfer.address.checksum,
            decimals: transfer.tokenDecimals,
            name: transfer.tokenName,
            symbol: transfer.tokenSymbol,
            type: 'ERC20',
          }))

      const internalTxs = tx.possibleSpam
        ? []
        : tx.internalTransactions?.map<InternalTx>((tx) => ({
            from: tx.from.checksum,
            to: tx.to.checksum,
            value: tx.value.toString(),
          }))

      prev.set(tx.hash, {
        txid: tx.hash,
        blockHash: tx.blockHash,
        blockHeight: Number(tx.blockNumber.toString()),
        timestamp: Math.floor(new Date(tx.blockTimestamp).getTime() / 1000),
        status: Number(tx.receiptStatus),
        confirmations: Number(currentBlock - tx.blockNumber.toBigInt() + 1n),
        from: tx.fromAddress.checksum,
        to: tx.toAddress?.checksum ?? '',
        value: tx.value,
        inputData: tx.input ?? '0x',
        fee: BigNumber(tx.transactionFee ?? '0')
          .times(1e18)
          .toFixed(0),
        gasLimit: tx.gas ?? '0',
        gasPrice: tx.gasPrice,
        gasUsed: tx.receiptGasUsed,
        tokenTransfers: tokenTransfers.length ? tokenTransfers : undefined,
        internalTxs: internalTxs?.length ? internalTxs : undefined,
      })

      return prev
    }, new Map<string, Tx>())

    // if no txs exist after filtering out already seen transactions, fetch the next page
    if (!txs.size) {
      cursor.moralisCursor = pagination.cursor
      return this.getTxs(pubkey, cursor, currentBlock, pageSize, from, to)
    }

    return { cursor: pagination.cursor, hasMore: Boolean(pagination.cursor), txs }
  }

  async doRpcRequest(req: RPCRequest | Array<RPCRequest>): Promise<RPCResponse | Array<RPCResponse>> {
    try {
      const { data } = await axiosWithRetry.post<RPCResponse>(this.rpcUrl, req)
      return data
    } catch (err) {
      throw handleError(err)
    }
  }

  subscribeAddresses(addresses: Array<string>): void {
    this.queue
      .add(async () => {
        this.currentAddresses = new Set(addresses)
        await this.updateStream()
      })
      .catch(() => undefined)
  }

  unsubscribeAddresses(addresses: Array<string>): void {
    this.subscribeAddresses(addresses)
  }

  async updateStream() {
    if (Date.now() < this.nextStreamUpdate) return

    try {
      if (!this.streamId) await this.initializeStream()

      const { toAdd, toRemove } = this.diffStream()

      const canAdd = toAdd.length > 0 && Date.now() >= this.nextStreamAdd
      const canRemove = toRemove.length > 0 && Date.now() >= this.nextStreamRemove

      if (!canAdd && !canRemove) return

      const baseArgs = { id: this.streamId!, networkType: 'evm' } as const

      // removals go first so the add reloads a smaller stream
      if (canRemove) {
        this.nextStreamRemove = Date.now() + STREAM_REMOVE_INTERVAL
        await Moralis.Streams.deleteAddress({ ...baseArgs, address: toRemove })
        toRemove.forEach((addr) => this.streamAddresses.delete(addr))
      }

      if (canAdd) {
        this.nextStreamAdd = Date.now() + STREAM_ADD_INTERVAL
        await Moralis.Streams.addAddress({ ...baseArgs, address: toAdd })
        toAdd.forEach((addr) => this.streamAddresses.add(addr))
      }
    } catch (err) {
      this.nextStreamUpdate = Date.now() + STREAM_ADD_INTERVAL

      const rateLimited = isRateLimitError(err)
      const currentAddresses = Array.from(this.currentAddresses)

      if (err instanceof Error) {
        this.logger.error({ error: err.message, rateLimited, currentAddresses }, 'failed to update stream')
      } else {
        this.logger.error({ rateLimited, currentAddresses }, 'failed to update stream')
      }
    }
  }

  private diffStream(): { toAdd: Array<string>; toRemove: Array<string> } {
    return {
      toAdd: Array.from(this.currentAddresses).filter((addr) => !this.streamAddresses.has(addr)),
      toRemove: Array.from(this.streamAddresses).filter((addr) => !this.currentAddresses.has(addr)),
    }
  }
}
