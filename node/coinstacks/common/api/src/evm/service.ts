import axios from 'axios'
import axiosRetry from 'axios-retry'
import BigNumber from 'bignumber.js'
import { ethers } from 'ethers'
import { ApiError as BlockbookApiError, Blockbook, Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'
import { ApiError, BadRequestError, BaseAPI, RPCRequest, RPCResponse, SendTxBody } from '../'
import {
  Account,
  API,
  TokenBalance,
  Tx,
  TxHistory,
  GasFees,
  InternalTx,
  GasEstimate,
  TokenMetadata,
  TokenType,
} from './models'
import {
  Cursor,
  NodeBlock,
  DebugCallStack,
  ExplorerApiResponse,
  ExplorerInternalTx,
  FeeHistory,
  TraceCall,
} from './types'
import { formatAddress } from './utils'
import { validatePageSize } from '../utils'
import { ERC1155_ABI } from './abi/erc1155'
import { ERC721_ABI } from './abi/erc721'

const axiosNoRetry = axios.create()

type InternalTxFetchMethod = 'trace_transaction' | 'debug_traceTransaction'

axiosRetry(axios, { retries: 5, retryDelay: axiosRetry.exponentialDelay })

const handleError = (err: unknown): ApiError => {
  if (err instanceof BlockbookApiError) {
    return new ApiError(err.response?.statusText ?? 'Internal Server Error', err.response?.status ?? 500, err.message)
  }

  if (err instanceof Error) {
    return new ApiError('Internal Server Error', 500, err.message)
  }

  return new ApiError('Internal Server Error', 500, 'unknown error')
}

const exponentialDelay = async (retryCount: number) =>
  new Promise((resolve) => setTimeout(resolve, axiosRetry.exponentialDelay(retryCount)))

export interface ServiceArgs {
  blockbook: Blockbook
  explorerApiKey?: string
  explorerApiUrl: string
  logger: Logger
  provider: ethers.providers.JsonRpcProvider
  rpcUrl: string
}

export class Service implements Omit<BaseAPI, 'getInfo'>, API {
  private readonly blockbook: Blockbook
  private readonly explorerApiKey?: string
  private readonly explorerApiUrl: string
  private readonly logger: Logger
  private readonly provider: ethers.providers.JsonRpcProvider
  private readonly rpcUrl: string
  private readonly abiInterface: Record<TokenType, ethers.utils.Interface> = {
    erc721: new ethers.utils.Interface(ERC721_ABI),
    erc1155: new ethers.utils.Interface(ERC1155_ABI),
  }

  constructor(args: ServiceArgs) {
    this.blockbook = args.blockbook
    this.explorerApiKey = args.explorerApiKey
    this.explorerApiUrl = args.explorerApiUrl
    this.logger = args.logger
    this.provider = args.provider
    this.rpcUrl = args.rpcUrl
  }

  async getAccount(pubkey: string): Promise<Account> {
    try {
      const data = await this.blockbook.getAddress(pubkey, undefined, undefined, undefined, undefined, 'tokenBalances')

      const tokens = (data.tokens ?? []).reduce<Array<TokenBalance>>((prev, token) => {
        // erc20/bep20
        if (token.balance && token.contract) {
          prev.push({
            balance: token.balance,
            contract: token.contract,
            decimals: token.decimals ?? 0,
            name: token.name,
            symbol: token.symbol ?? '',
            type: token.type,
          })
        }

        // erc721/bep721
        token.ids?.forEach((id) => {
          if (!token.contract) return

          prev.push({
            balance: '1',
            contract: token.contract,
            decimals: 0,
            name: token.name,
            symbol: token.symbol ?? '',
            type: token.type,
            id,
          })
        })

        // erc721/bep721
        token.multiTokenValues?.forEach((multiToken) => {
          if (!token.contract) return

          prev.push({
            balance: multiToken.value,
            contract: token.contract,
            decimals: 0,
            name: token.name,
            symbol: token.symbol ?? '',
            type: token.type,
            id: multiToken.id,
          })
        })

        return prev
      }, [])

      return {
        balance: data.balance,
        unconfirmedBalance: data.unconfirmedBalance,
        nonce: Number(data.nonce ?? 0),
        pubkey: data.address,
        tokens,
      }
    } catch (err) {
      throw handleError(err)
    }
  }

  async getTxHistory(pubkey: string, cursor?: string, pageSize = 10): Promise<TxHistory> {
    validatePageSize(pageSize)

    const curCursor = ((): Cursor => {
      try {
        if (!cursor) return { blockbookPage: 1, explorerPage: 1 }

        return JSON.parse(Buffer.from(cursor, 'base64').toString('binary'))
      } catch (err) {
        const e: BadRequestError = { error: `invalid base64 cursor: ${cursor}` }
        throw new ApiError('Bad Request', 422, JSON.stringify(e))
      }
    })()

    try {
      let { hasMore: hasMoreBlockbookTxs, txs: blockbookTxs } = await this.getTxs(pubkey, pageSize, curCursor)
      let { hasMore: hasMoreInternalTxs, internalTxs } = await this.getInternalTxs(pubkey, pageSize, curCursor)

      if (!blockbookTxs.size && !internalTxs.size) {
        return {
          pubkey: pubkey,
          txs: [],
        }
      }

      const txs: Array<Tx> = []
      for (let i = 0; i < pageSize; i++) {
        if (!blockbookTxs.size && hasMoreBlockbookTxs) {
          curCursor.blockbookPage++
          ;({ hasMore: hasMoreBlockbookTxs, txs: blockbookTxs } = await this.getTxs(pubkey, pageSize, curCursor))
        }

        if (!internalTxs.size && hasMoreInternalTxs) {
          curCursor.explorerPage++
          ;({ hasMore: hasMoreInternalTxs, internalTxs } = await this.getInternalTxs(pubkey, pageSize, curCursor))
        }

        if (!internalTxs.size && !blockbookTxs.size) break

        const [internalTx] = internalTxs.values()
        const [blockbookTx] = blockbookTxs.values()

        if (blockbookTx?.blockHeight === -1) {
          // process pending txs first, no associated internal txs

          txs.push({ ...blockbookTx })
          blockbookTxs.delete(blockbookTx.txid)
          curCursor.blockbookTxid = blockbookTx.txid
        } else if (blockbookTx && blockbookTx.blockHeight >= (internalTx?.blockHeight ?? -2)) {
          // process transactions in descending order prioritizing confirmed, include associated internal txs

          txs.push({ ...blockbookTx, internalTxs: internalTxs.get(blockbookTx.txid)?.txs })

          blockbookTxs.delete(blockbookTx.txid)
          curCursor.blockbookTxid = blockbookTx.txid

          // if there was a matching internal tx, delete it and track as last internal txid seen
          if (internalTxs.has(blockbookTx.txid)) {
            internalTxs.delete(blockbookTx.txid)
            curCursor.explorerTxid = blockbookTx.txid
          }
        } else {
          // attempt to get matching blockbook tx or fetch if not found
          // if fetch fails, treat internal tx as handled and remove from set
          try {
            const blockbookTx =
              blockbookTxs.get(internalTx.txid) ??
              this.handleTransaction(await this.blockbook.getTransaction(internalTx.txid))

            txs.push({ ...blockbookTx, internalTxs: internalTx.txs })
          } catch (err) {
            this.logger.warn(err, `failed to get tx: ${internalTx.txid}`)
          }

          internalTxs.delete(internalTx.txid)
          curCursor.explorerTxid = internalTx.txid

          // if there was a matching blockbook tx, delete it and track as last blockbook txid seen
          if (blockbookTxs.has(internalTx.txid)) {
            blockbookTxs.delete(internalTx.txid)
            curCursor.blockbookTxid = internalTx.txid
          }
        }
      }

      // if we processed through the whole set of transactions, increase the page number for next fetch
      if (!blockbookTxs.size) curCursor.blockbookPage++
      if (!internalTxs.size) curCursor.blockbookPage++

      curCursor.blockHeight = txs[txs.length - 1]?.blockHeight

      const nextCursor = (() => {
        if (!hasMoreBlockbookTxs && !hasMoreInternalTxs) return
        return Buffer.from(JSON.stringify(curCursor), 'binary').toString('base64')
      })()

      return {
        pubkey: pubkey,
        cursor: nextCursor,
        txs: txs,
      }
    } catch (err) {
      throw handleError(err)
    }
  }

  async getTransaction(txid: string): Promise<Tx> {
    try {
      const data = await this.blockbook.getTransaction(txid)
      return this.handleTransactionWithInternal(data)
    } catch (err) {
      throw handleError(err)
    }
  }

  async estimateGas(data: string, from: string, to: string, value: string): Promise<GasEstimate> {
    try {
      const tx: ethers.providers.TransactionRequest = { data, from, to, value: ethers.utils.parseUnits(value, 'wei') }
      const gasLimit = await this.provider.estimateGas(tx)
      return { gasLimit: gasLimit.toString() }
    } catch (err) {
      throw new ApiError('Internal Server Error', 500, JSON.stringify(err))
    }
  }

  async getGasFees(): Promise<GasFees> {
    try {
      // average fees over 20 blocks at the specified percentiles
      const totalBlocks = 20

      // fetch legacy gas price
      const gasPrice = (await this.provider.send('eth_gasPrice', [])) as string

      // get latest block to check for existence of baseFeePerGas to determine eip1559 support
      const block = (await this.provider.send('eth_getBlockByNumber', ['pending', false])) as { baseFeePerGas?: string }

      const eip1559Fees = await (async () => {
        if (!block?.baseFeePerGas) return {}

        // fetch fee history for the last 20 blocks and with maxPriorityFeePerGas reported at the 1st, 60th, and 90th percentiles (slow, average, fast)
        const feeHistory = (await this.provider.send('eth_feeHistory', [
          totalBlocks,
          'latest',
          [1, 60, 90],
        ])) as FeeHistory

        const oldestBlock = Number(feeHistory.oldestBlock)
        const latestBlock = oldestBlock + totalBlocks

        // hex -> big number
        const blockHistory = []
        for (let i = oldestBlock; i < latestBlock; i++) {
          const index = i - oldestBlock
          blockHistory.push({
            number: i,
            baseFeePerGas: new BigNumber(feeHistory.baseFeePerGas[index]),
            gasUsedRatio: new BigNumber(feeHistory.gasUsedRatio[index]),
            maxPriorityFeePerGas: feeHistory.reward[index].map((r) => new BigNumber(r)),
          })
        }

        const baseFee = await (async () => {
          try {
            // avalanche returns the latest block for 'pending', use eth_baseFee instead for accurate base fee
            const baseFee = (await this.provider.send('eth_baseFee', [])) as string
            return baseFee
          } catch (err) {
            // no eth_baseFee support, use pending block
            return
          }
        })()

        // baseFeePerGas for pending block as determined by network
        const baseFeePerGas = baseFee ? new BigNumber(baseFee) : new BigNumber(block.baseFeePerGas)

        const avg = (arr: Array<BigNumber>): BigNumber => {
          const sum = arr.reduce((a, b) => a.plus(b), new BigNumber(0))
          return sum.div(arr.length).integerValue(BigNumber.ROUND_FLOOR)
        }

        const slowPriorityFee = avg(blockHistory.map((block) => block.maxPriorityFeePerGas[0]))
        const averagePriorityFee = avg(blockHistory.map((block) => block.maxPriorityFeePerGas[1]))
        const fastPriorityFee = avg(blockHistory.map((block) => block.maxPriorityFeePerGas[2]))

        return {
          slow: {
            maxFeePerGas: slowPriorityFee.plus(baseFeePerGas).toFixed(0),
            maxPriorityFeePerGas: slowPriorityFee.toFixed(0),
          },
          average: {
            maxFeePerGas: averagePriorityFee.plus(baseFeePerGas).toFixed(0),
            maxPriorityFeePerGas: averagePriorityFee.toFixed(0),
          },
          fast: {
            maxFeePerGas: fastPriorityFee.plus(baseFeePerGas).toFixed(0),
            maxPriorityFeePerGas: fastPriorityFee.toFixed(0),
          },
        }
      })()

      // TODO: percentile estimations for gasPrice
      return {
        gasPrice: new BigNumber(gasPrice).toFixed(0),
        maxFeePerGas: eip1559Fees?.average?.maxFeePerGas,
        maxPriorityFeePerGas: eip1559Fees?.average?.maxPriorityFeePerGas,
        slow: { ...eip1559Fees?.slow },
        average: { ...eip1559Fees?.average },
        fast: { ...eip1559Fees?.fast },
      }
    } catch (err) {
      throw new ApiError('Internal Server Error', 500, JSON.stringify(err))
    }
  }

  async sendTx(body: SendTxBody): Promise<string> {
    try {
      const { result } = await this.blockbook.sendTransaction(body.hex)
      return result
    } catch (err) {
      throw handleError(err)
    }
  }

  async handleBlock(hash: string, retryCount = 0): Promise<Array<BlockbookTx>> {
    const request: RPCRequest = {
      jsonrpc: '2.0',
      id: `eth_getBlockByHash-${hash}`,
      method: 'eth_getBlockByHash',
      params: [hash, false],
    }

    const { data } = await axios.post<RPCResponse>(this.rpcUrl, request)

    if (data.error) throw new Error(`failed to get block: ${hash}: ${data.error.message}`)

    // retry if no results are returned, this typically means we queried a node that hasn't indexed the data yet
    if (!data.result) {
      if (retryCount >= 5) throw new Error(`failed to get block: ${hash}: ${JSON.stringify(data)}`)
      retryCount++
      await exponentialDelay(retryCount)
      return this.handleBlock(hash, retryCount)
    }

    const block = data.result as NodeBlock

    // make best effort to fetch all transactions, but don't fail handling block if a single transaction fails
    const txs = await Promise.allSettled(block.transactions.map((hash) => this.blockbook.getTransaction(hash)))

    return txs
      .filter((tx): tx is PromiseFulfilledResult<BlockbookTx> => tx.status === 'fulfilled')
      .map((tx) => tx.value)
  }

  handleTransaction(tx: BlockbookTx): Tx {
    if (!tx.ethereumSpecific) throw new Error(`invalid blockbook evm transaction: ${tx.txid}`)

    const inputData = tx.ethereumSpecific.data

    return {
      txid: tx.txid,
      blockHash: tx.blockHash,
      blockHeight: tx.blockHeight,
      timestamp: tx.blockTime,
      status: tx.ethereumSpecific.status,
      from: tx.vin[0].addresses?.[0] ?? '',
      to: tx.vout[0].addresses?.[0] ?? '',
      confirmations: tx.confirmations,
      value: tx.value,
      fee: tx.fees ?? '0',
      gasLimit: tx.ethereumSpecific.gasLimit.toString(),
      gasUsed: tx.ethereumSpecific.gasUsed?.toString() ?? '0',
      gasPrice: tx.ethereumSpecific.gasPrice.toString(),
      inputData: inputData && inputData !== '0x' && inputData !== '0x0' ? inputData : undefined,
      tokenTransfers: tx.tokenTransfers?.map((tt) => {
        const value = (() => {
          switch (tt.type) {
            case 'ERC721':
            case 'BEP721':
              return '1'
            case 'ERC1155':
            case 'BEP1155':
              return tt.multiTokenValues?.[0]?.value ?? '0'
            default:
              return tt.value
          }
        })()

        const id = (() => {
          switch (tt.type) {
            case 'ERC721':
            case 'BEP721':
              return tt.value
            case 'ERC1155':
            case 'BEP1155':
              return tt.multiTokenValues?.[0]?.id
            default:
              return
          }
        })()

        return {
          contract: tt.contract,
          decimals: tt.decimals,
          name: tt.name,
          symbol: tt.symbol,
          type: tt.type,
          from: tt.from,
          to: tt.to,
          value,
          id,
        }
      }),
    }
  }

  /**
   * format transaction and call debug_traceTransaction to extract internal transactions on newly confirmed transactions only.
   *
   * __not suitable for use on historical transactions when using a full node as the evm state is purged__
   */
  async handleTransactionWithInternalTrace(
    tx: BlockbookTx,
    internalTxMethod: InternalTxFetchMethod = 'debug_traceTransaction'
  ): Promise<Tx> {
    const t = this.handleTransaction(tx)

    // don't trace pending transactions as they have no committed state to trace
    // don't trace transaction if there is not input data that would potentially result in an internal transaction
    if (t.confirmations === 0 || !t.inputData) return t

    // allow transaction to be handled even if we fail to get internal transactions (some better than none)
    const internalTxs = await (async () => {
      try {
        if (internalTxMethod === 'trace_transaction') {
          return await this.fetchInternalTxsTrace(tx.txid)
        } else {
          return await this.fetchInternalTxsDebug(tx.txid)
        }
      } catch (err) {
        return undefined
      }
    })()

    t.internalTxs = internalTxs

    return t
  }

  private async fetchInternalTxsTrace(txid: string, retryCount = 0): Promise<Array<InternalTx> | undefined> {
    const request: RPCRequest = {
      jsonrpc: '2.0',
      id: `trace_transaction${txid}`,
      method: 'trace_transaction',
      params: [txid],
    }

    const { data } = await axios.post<RPCResponse>(this.rpcUrl, request)

    if (data.error) {
      console.log(data.error)
      throw new Error(`failed to get internalTransactions for txid: ${txid}: ${data.error.message}`)
    }

    // retry if no results are returned, this typically means we queried a node that hasn't indexed the data yet
    if (!data.result) {
      if (retryCount >= 5) throw new Error(`failed to get internalTransactions for txid: ${txid}`)
      retryCount++
      await exponentialDelay(retryCount)
      return this.fetchInternalTxsTrace(txid, retryCount)
    }

    const callStack = data.result as Array<TraceCall>

    if (!callStack) {
      return undefined
    }

    const txs: InternalTx[] = callStack
      .map((call) => {
        const value = new BigNumber(call.action.value ?? 0)
        const gas = new BigNumber(call.action.gas)
        if (value.gt(0) && gas.gt(0)) {
          return {
            from: formatAddress(call.action.from),
            to: formatAddress(call.action.to),
            value: value.toString(),
          }
        }
        return null
      })
      .filter((tx): tx is InternalTx => tx !== null)

    return txs
  }

  private async fetchInternalTxsDebug(txid: string, retryCount = 0): Promise<Array<InternalTx> | undefined> {
    const request: RPCRequest = {
      jsonrpc: '2.0',
      id: `debug_traceTransaction${txid}`,
      method: 'debug_traceTransaction',
      params: [txid, { tracer: 'callTracer' }],
    }

    const { data } = await axios.post<RPCResponse>(this.rpcUrl, request)

    if (data.error) {
      console.log(data.error)
      throw new Error(`failed to get internalTransactions for txid: ${txid}: ${data.error.message}`)
    }

    // retry if no results are returned, this typically means we queried a node that hasn't indexed the data yet
    if (!data.result) {
      if (retryCount >= 5) throw new Error(`failed to get internalTransactions for txid: ${txid}`)
      retryCount++
      await exponentialDelay(retryCount)
      return this.fetchInternalTxsDebug(txid, retryCount)
    }

    const callStack = data.result as DebugCallStack

    const processCallStack = (
      calls?: Array<DebugCallStack>,
      txs: Array<InternalTx> = []
    ): Array<InternalTx> | undefined => {
      if (!calls) return

      calls.forEach((call) => {
        const value = new BigNumber(call.value ?? 0)
        const gas = new BigNumber(call.gas)

        if (value.gt(0) && gas.gt(0)) {
          txs.push({
            from: formatAddress(call.from),
            to: formatAddress(call.to),
            value: value.toString(),
          })
        }

        processCallStack(call.calls, txs)
      })

      return txs.length ? txs : undefined
    }
    return processCallStack(callStack.calls)
  }

  /**
   * format transaction and fetch internal transactions from external explorer api
   *
   * __suitable for use on historical transactions that are unable to be traced on a full node__
   */
  private async handleTransactionWithInternal(tx: BlockbookTx): Promise<Tx> {
    const t = this.handleTransaction(tx)

    // don't fetch internal transactions if there is no input data that would potentially result in an internal transaction
    if (!t.inputData) return t

    // allow transaction to be handled even if we fail to get internal transactions (some better than none)
    const internalTxs = await (async () => {
      try {
        return await this.fetchInternalTxsByTxid(tx.txid)
      } catch (err) {
        return undefined
      }
    })()

    t.internalTxs = internalTxs

    return t
  }

  private async fetchInternalTxsByTxid(txid: string): Promise<Array<InternalTx> | undefined> {
    const { data } = await axios.get<ExplorerApiResponse<Array<ExplorerInternalTx>>>(
      `${this.explorerApiUrl}?module=account&action=txlistinternal&txhash=${txid}&apikey=${this.explorerApiKey}`
    )

    if (data.status === '0') return []

    return data.result.map((t) => ({ from: formatAddress(t.from), to: formatAddress(t.to), value: t.value }))
  }

  private async getInternalTxs(
    address: string,
    pageSize: number,
    cursor: Cursor
  ): Promise<{
    hasMore: boolean
    internalTxs: Map<string, { blockHeight: number; txid: string; txs: Array<InternalTx> }>
  }> {
    const internalTxs = await this.fetchInternalTxsByAddress(address, cursor.explorerPage, pageSize)

    const data = new Map<string, { blockHeight: number; txid: string; txs: Array<InternalTx> }>()

    if (!internalTxs?.length) return { hasMore: false, internalTxs: data }

    let doneFiltering = false
    const filteredInternalTxs = internalTxs.reduce((prev, internalTx) => {
      if (!doneFiltering && cursor.blockHeight && cursor.explorerTxid) {
        // skip any transactions from blocks that we have already returned
        if (Number(internalTx.blockNumber) > cursor.blockHeight) return prev

        // skip any transaction that we have already returned within the same block
        // this assumes transactions are ordered in the same position within the block on every request
        if (Number(internalTx.blockNumber) === cursor.blockHeight) {
          if (cursor.explorerTxid === internalTx.hash) {
            doneFiltering = true
          }
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
      return this.getInternalTxs(address, pageSize, cursor)
    }

    return {
      hasMore: internalTxs.length < pageSize ? false : true,
      internalTxs: filteredInternalTxs,
    }
  }

  private async fetchInternalTxsByAddress(
    address: string,
    page: number,
    pageSize: number
  ): Promise<Array<ExplorerInternalTx> | undefined> {
    const { data } = await axios.get<ExplorerApiResponse<Array<ExplorerInternalTx>>>(
      `${this.explorerApiUrl}?module=account&action=txlistinternal&address=${address}&page=${page}&offset=${pageSize}&sort=desc&apikey=${this.explorerApiKey}`
    )

    if (data.status === '0') return []

    return data.result
  }

  private async getTxs(
    address: string,
    pageSize: number,
    cursor: Cursor
  ): Promise<{ hasMore: boolean; txs: Map<string, Tx> }> {
    const blockbookData = await this.blockbook.getAddress(
      address,
      cursor.blockbookPage,
      pageSize,
      undefined,
      undefined,
      'txs'
    )

    const data = new Map<string, Tx>()

    if (!blockbookData?.transactions?.length || cursor.blockbookPage > (blockbookData.totalPages ?? -1)) {
      return { hasMore: false, txs: data }
    }

    let doneFiltering = false
    let pendingTxFound: BlockbookTx | undefined
    const blockbookTxs = blockbookData.transactions.reduce((prev, tx) => {
      if (!doneFiltering && cursor.blockHeight && cursor.blockbookTxid) {
        // if the last pending tx is no longer pending, we can no longer determine confidently what we have already returned
        // consider the tx found and process the remaining txs without additional filtering
        if (cursor.blockHeight === -1 && !pendingTxFound) {
          pendingTxFound = blockbookData.transactions?.find(
            (tx) => tx.blockHeight === -1 && tx.txid === cursor.blockbookTxid
          )

          if (!pendingTxFound) {
            prev.set(tx.txid, this.handleTransaction(tx))
            doneFiltering = true
            return prev
          }
        }

        // skip any transactions from blocks that we have already returned (handle pending separately)
        if (cursor.blockHeight >= 0 && tx.blockHeight > cursor.blockHeight) return prev

        // skip any transaction that we have already returned within the same block
        // this assumes transactions are ordered the same (by nonce) on every request
        if (tx.blockHeight === cursor.blockHeight) {
          if (cursor.blockbookTxid === tx.txid) {
            doneFiltering = true
          }

          return prev
        }

        doneFiltering = true
      }

      prev.set(tx.txid, this.handleTransaction(tx))
      return prev
    }, data)

    // if no txs exist after filtering out already seen transactions, fetch the next page
    if (!blockbookTxs.size) {
      cursor.blockbookPage++
      return this.getTxs(address, pageSize, cursor)
    }

    return {
      hasMore: cursor.blockbookPage < (blockbookData.totalPages ?? -1) ? true : false,
      txs: blockbookTxs,
    }
  }

  async getTokenMetadata(address: string, id: string, type: TokenType): Promise<TokenMetadata> {
    const substitue = (data: string, id: string, hexEncoded: boolean): string => {
      if (!data.includes('{id}')) return data
      if (!hexEncoded) return data.replace('{id}', id)
      return data.replace('{id}', new BigNumber(id).toString(16).padStart(64, '0').toLowerCase())
    }

    const contract = new ethers.Contract(address, this.abiInterface[type], this.provider)

    const uri = (await (() => {
      switch (type) {
        case 'erc721':
          return contract.tokenURI(id)
        case 'erc1155':
          return contract.uri(id)
        default:
          throw new Error(`invalid token type: ${type}`)
      }
    })()) as string

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metadata = await (async () => {
      if (uri.startsWith('ipfs://')) return {}

      try {
        // attempt to get metadata using hex encoded id as per erc spec
        const { data } = await axiosNoRetry.get(substitue(uri, id, true))
        return data
      } catch (err) {
        try {
          // not everyone follows the spec
          // attempt to get metadata using id string
          const { data } = await axiosNoRetry.get(substitue(uri, id, false))
          return data
        } catch (err) {
          // swallow error and return empty object if unable to fetch metadata
          return {}
        }
      }
    })()

    const mediaUrl = metadata.image ?? ''

    const mediaType = await (async () => {
      if (!mediaUrl || mediaUrl.startsWith('ipfs://')) return
      const { headers } = await axiosNoRetry.head(mediaUrl)
      return headers['content-type']?.includes('video') ? 'video' : 'image'
    })()

    return {
      name: metadata.name ?? '',
      description: metadata.description ?? '',
      media: {
        url: mediaUrl,
        type: mediaType,
      },
    }
  }
}
