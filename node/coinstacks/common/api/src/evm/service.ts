import type { Blockbook, Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import type { Logger } from '@shapeshiftoss/logger'
import axios, { AxiosError } from 'axios'
import BigNumber from 'bignumber.js'
import { ethers } from 'ethers'
import type { BadRequestError, BaseAPI, RPCRequest, RPCResponse, SendTxBody } from '../'
import { ApiError } from '../'
import { createAxiosRetry, exponentialDelay, handleError, validatePageSize } from '../utils'
import type {
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
import type {
  Cursor,
  DebugCallStack,
  ExplorerApiResponse,
  TraceCall,
  ExplorerInternalTxByHash,
  ExplorerInternalTxByAddress,
} from './types'
import type { GasOracle } from './gasOracle'
import { ERC1155_ABI } from './abi/erc1155'
import { ERC721_ABI } from './abi/erc721'

const axiosNoRetry = axios.create({ timeout: 5000 })
const axiosWithRetry = createAxiosRetry({}, { timeout: 10000 })

type InternalTxFetchMethod = 'trace_transaction' | 'debug_traceTransaction'

export const formatAddress = (address: string): string => ethers.utils.getAddress(address)

export interface ServiceArgs {
  blockbook: Blockbook
  gasOracle: GasOracle
  explorerApiUrl: URL
  logger: Logger
  provider: ethers.providers.JsonRpcProvider
  rpcUrl: string
  rpcApiKey?: string
}

export class Service implements Omit<BaseAPI, 'getInfo'>, API {
  private readonly blockbook: Blockbook
  private readonly gasOracle: GasOracle
  private readonly explorerApiUrl: URL
  private readonly logger: Logger
  private readonly provider: ethers.providers.JsonRpcProvider
  private readonly rpcUrl: string
  private readonly rpcApiKey?: string
  private readonly abiInterface: Record<TokenType, ethers.utils.Interface> = {
    erc721: new ethers.utils.Interface(ERC721_ABI),
    erc1155: new ethers.utils.Interface(ERC1155_ABI),
  }

  constructor(args: ServiceArgs) {
    this.blockbook = args.blockbook
    this.gasOracle = args.gasOracle
    this.explorerApiUrl = args.explorerApiUrl
    this.logger = args.logger.child({ namespace: ['service'] })
    this.provider = args.provider
    this.rpcUrl = args.rpcUrl
    this.rpcApiKey = args.rpcApiKey

    this.gasOracle.start()
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

  async getTxHistory(pubkey: string, cursor?: string, pageSize = 10, from?: number, to?: number): Promise<TxHistory> {
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
      let { hasMore: hasMoreBlockbookTxs, txs: blockbookTxs } = await this.getTxs(pubkey, pageSize, curCursor, from, to)
      let { hasMore: hasMoreInternalTxs, internalTxs } = await this.getInternalTxs(
        pubkey,
        pageSize,
        curCursor,
        from,
        to
      )

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
          ;({ hasMore: hasMoreBlockbookTxs, txs: blockbookTxs } = await this.getTxs(
            pubkey,
            pageSize,
            curCursor,
            from,
            to
          ))
        }

        if (!internalTxs.size && hasMoreInternalTxs) {
          curCursor.explorerPage++
          ;({ hasMore: hasMoreInternalTxs, internalTxs } = await this.getInternalTxs(
            pubkey,
            pageSize,
            curCursor,
            from,
            to
          ))
        }

        if (!internalTxs.size && !blockbookTxs.size) break

        const [internalTx] = internalTxs.values()
        const [blockbookTx] = blockbookTxs.values()

        if (blockbookTx?.blockHeight === -1) {
          // process pending txs first, no associated internal txs

          txs.push({ ...blockbookTx })
          blockbookTxs.delete(blockbookTx.txid)
          curCursor.blockbookTxid = blockbookTx.txid
          curCursor.blockHeight = blockbookTx.blockHeight
        } else if (blockbookTx && blockbookTx.blockHeight >= (internalTx?.blockHeight ?? -2)) {
          // process transactions in descending order prioritizing confirmed, include associated internal txs

          txs.push({ ...blockbookTx, internalTxs: internalTxs.get(blockbookTx.txid)?.txs })

          blockbookTxs.delete(blockbookTx.txid)
          curCursor.blockbookTxid = blockbookTx.txid
          curCursor.blockHeight = blockbookTx.blockHeight

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
          curCursor.blockHeight = internalTx.blockHeight

          // if there was a matching blockbook tx, delete it and track as last blockbook txid seen
          if (blockbookTxs.has(internalTx.txid)) {
            blockbookTxs.delete(internalTx.txid)
            curCursor.blockbookTxid = internalTx.txid
          }
        }
      }

      // if we processed through the whole set of transactions, increase the page number for next fetch
      if (!blockbookTxs.size) curCursor.blockbookPage++
      if (!internalTxs.size) curCursor.explorerPage++

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
      throw handleError(err)
    }
  }

  async getGasFees(): Promise<GasFees> {
    try {
      const baseFeePerGas = this.gasOracle.getBaseFeePerGas()
      const estimatedFees = await this.gasOracle.estimateFees([1, 60, 90])

      return {
        baseFeePerGas,
        slow: estimatedFees['1'],
        average: estimatedFees['60'],
        fast: estimatedFees['90'],
      }
    } catch (err) {
      throw handleError(err)
    }
  }

  async sendTx(body: SendTxBody): Promise<string> {
    try {
      const request: RPCRequest = {
        jsonrpc: '2.0',
        id: 'eth_sendRawTransaction',
        method: 'eth_sendRawTransaction',
        params: [body.hex],
      }

      const config = this.rpcApiKey ? { headers: { 'api-key': this.rpcApiKey } } : undefined
      const { data } = await axiosNoRetry.post<RPCResponse>(this.rpcUrl, request, config)

      if (!data.result) throw new Error(JSON.stringify(data.error))

      return data.result as string
    } catch (err) {
      throw handleError(err)
    }
  }

  async handleBlock(hash: string): Promise<Array<BlockbookTx>> {
    try {
      const { txs = [], totalPages = 1 } = await this.blockbook.getBlock(hash)
      for (let page = 1; page < totalPages; ++page) {
        const data = await this.blockbook.getBlock(hash, page)
        data.txs && txs.push(...data.txs)
      }
      return txs
    } catch (err) {
      throw handleError(err)
    }
  }

  async fetchInternalTxsByBlockDebug(
    blockHash: string,
    retryCount = 0
  ): Promise<Record<string, Array<InternalTx> | undefined>> {
    const request: RPCRequest = {
      jsonrpc: '2.0',
      id: `debug_traceBlockByHash${blockHash}`,
      method: 'debug_traceBlockByHash',
      params: [blockHash, { tracer: 'callTracer' }],
    }

    const config = this.rpcApiKey ? { headers: { 'api-key': this.rpcApiKey } } : undefined
    const { data } = await axiosWithRetry.post<RPCResponse>(this.rpcUrl, request, config)

    if (!data.result) {
      if (++retryCount >= 5)
        throw new Error(`failed to get internalTransactions for block: ${blockHash}: ${data.error?.message}`)
      await exponentialDelay(retryCount)
      return this.fetchInternalTxsByBlockDebug(blockHash, retryCount)
    }

    const txs = data.result as Array<{ txHash: string; result: DebugCallStack }>

    return txs.reduce<Record<string, Array<InternalTx> | undefined>>((prev, tx) => {
      prev[tx.txHash] = this.processCallStackDebug(tx.result.calls)
      return prev
    }, {})
  }

  async fetchInternalTxsByBlockTrace(
    blockHash: string,
    retryCount = 0
  ): Promise<Record<string, Array<InternalTx> | undefined>> {
    const request: RPCRequest = {
      jsonrpc: '2.0',
      id: `trace_block${blockHash}`,
      method: 'trace_block',
      params: [blockHash],
    }

    const config = this.rpcApiKey ? { headers: { 'api-key': this.rpcApiKey } } : undefined
    const { data } = await axiosWithRetry.post<RPCResponse>(this.rpcUrl, request, config)

    if (!data.result) {
      if (++retryCount >= 5)
        throw new Error(`failed to get internalTransactions for block: ${blockHash}: ${data.error?.message}`)
      await exponentialDelay(retryCount)
      return this.fetchInternalTxsByBlockTrace(blockHash, retryCount)
    }

    const callStack = data.result as Array<TraceCall>

    return this.processCallStackTrace(callStack)
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
          return await this.fetchInternalTxsByTxTrace(tx.txid)
        } else {
          return await this.fetchInternalTxsByTxDebug(tx.txid)
        }
      } catch (err) {
        return undefined
      }
    })()

    t.internalTxs = internalTxs

    return t
  }

  private async fetchInternalTxsByTxTrace(txid: string, retryCount = 0): Promise<Array<InternalTx> | undefined> {
    const request: RPCRequest = {
      jsonrpc: '2.0',
      id: `trace_transaction${txid}`,
      method: 'trace_transaction',
      params: [txid],
    }

    const config = this.rpcApiKey ? { headers: { 'api-key': this.rpcApiKey } } : undefined
    const { data } = await axiosWithRetry.post<RPCResponse>(this.rpcUrl, request, config)

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

  private async fetchInternalTxsByTxDebug(txid: string, retryCount = 0): Promise<Array<InternalTx> | undefined> {
    const request: RPCRequest = {
      jsonrpc: '2.0',
      id: `debug_traceTransaction${txid}`,
      method: 'debug_traceTransaction',
      params: [txid, { tracer: 'callTracer' }],
    }

    const config = this.rpcApiKey ? { headers: { 'api-key': this.rpcApiKey } } : undefined
    const { data } = await axiosWithRetry.post<RPCResponse>(this.rpcUrl, request, config)

    if (!data.result) {
      if (++retryCount >= 5)
        throw new Error(`failed to get internalTransactions for txid: ${txid}: ${data.error?.message}`)
      await exponentialDelay(retryCount)
      return this.fetchInternalTxsByTxDebug(txid, retryCount)
    }

    const callStack = data.result as DebugCallStack
    const txs = this.processCallStackDebug(callStack.calls)

    return txs.length ? txs : undefined
  }

  private processCallStackDebug = (calls?: Array<DebugCallStack>, txs: Array<InternalTx> = []): Array<InternalTx> => {
    calls?.forEach((call) => {
      const value = new BigNumber(call.value ?? 0)
      const gas = new BigNumber(call.gas)

      if (value.gt(0) && gas.gt(0)) {
        txs.push({
          from: formatAddress(call.from),
          to: formatAddress(call.to),
          value: value.toString(),
        })
      }

      this.processCallStackDebug(call.calls, txs)
    })

    return txs
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
    const url = new URL(this.explorerApiUrl.toString())

    url.searchParams.append('module', 'account')
    url.searchParams.append('action', 'txlistinternal')
    url.searchParams.append('txhash', txid)

    const { data } = await axiosWithRetry.get<ExplorerApiResponse<Array<ExplorerInternalTxByHash>>>(url.toString())

    if (data.status === '0') return []

    return data.result.reduce<Array<InternalTx>>((prev, t) => {
      // filter out all 0 index trace ids as these are the normal initiating tx calls that are returned by routescan.io for some reason
      if (t.index === 0) return prev
      return [...prev, { from: formatAddress(t.from), to: formatAddress(t.to), value: t.value }]
    }, [])
  }

  private async getInternalTxs(
    address: string,
    pageSize: number,
    cursor: Cursor,
    from?: number,
    to?: number
  ): Promise<{
    hasMore: boolean
    internalTxs: Map<string, { blockHeight: number; txid: string; txs: Array<InternalTx> }>
  }> {
    const internalTxs = await this.fetchInternalTxsByAddress(address, cursor.explorerPage, pageSize, from, to)

    const data = new Map<string, { blockHeight: number; txid: string; txs: Array<InternalTx> }>()

    if (!internalTxs?.length) return { hasMore: false, internalTxs: data }

    let doneFiltering = false
    const filteredInternalTxs = internalTxs.reduce((prev, internalTx) => {
      if (!internalTx.value || internalTx.value === '0') return prev

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
      return this.getInternalTxs(address, pageSize, cursor, from, to)
    }

    return {
      hasMore: internalTxs.length < pageSize ? false : true,
      internalTxs: filteredInternalTxs,
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

  private async getTxs(
    address: string,
    pageSize: number,
    cursor: Cursor,
    from?: number,
    to?: number
  ): Promise<{ hasMore: boolean; txs: Map<string, Tx> }> {
    const blockbookData = await this.blockbook.getAddress(address, cursor.blockbookPage, pageSize, from, to, 'txs')

    const data = new Map<string, Tx>()

    const rangeQuery = from || to

    if (
      !blockbookData?.transactions?.length ||
      // page will not increment past the last page for all queries, we can use this to detect "totalPages" for range queries
      (blockbookData.page && cursor.blockbookPage > blockbookData.page) ||
      // blockbook does not provide total pages for range queries
      (!rangeQuery && cursor.blockbookPage > (blockbookData.totalPages ?? -1))
    ) {
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
      return this.getTxs(address, pageSize, cursor, from, to)
    }

    return {
      hasMore:
        // use total pages for non range queries
        (!rangeQuery && cursor.blockbookPage < (blockbookData.totalPages ?? -1)) ||
        // use page for range queries which should exists (if this is not enough, we can look at blockbook.Txs.length)
        (rangeQuery && blockbookData.page && cursor.blockbookPage <= blockbookData.page)
          ? true
          : false,
      txs: blockbookTxs,
    }
  }

  async getTokenMetadata(address: string, id: string, type: TokenType): Promise<TokenMetadata> {
    const substitue = (data: string, id: string, hexEncoded: boolean): string => {
      if (!data.includes('{id}')) return data
      if (!hexEncoded) return data.replace('{id}', id)
      return data.replace('{id}', new BigNumber(id).toString(16).padStart(64, '0').toLowerCase())
    }

    const makeUrl = (url: string): string => {
      if (url.startsWith('ipfs://')) {
        return url.replace('ipfs://', 'https://gateway.shapeshift.com/ipfs/')
      }

      if (url.startsWith('ipns://')) {
        return url.replace('ipns://', 'https://gateway.shapeshift.com/ipns/')
      }

      return url
    }

    try {
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

      const metadata = await (async () => {
        // handle base64 encoded metadata
        if (uri.startsWith('data:application/json;base64')) {
          const [, b64] = uri.split(',')
          return JSON.parse(Buffer.from(b64, 'base64').toString())
        }

        try {
          // attempt to get metadata using hex encoded id as per erc spec
          const { data } = await axiosNoRetry.get(makeUrl(substitue(uri, id, true)))
          return data
        } catch (err) {
          // don't retry on timeout, assume host is offline
          if (err instanceof AxiosError && err.code === AxiosError.ECONNABORTED) return {}

          try {
            // not everyone follows the spec, attempt to get metadata using id string
            const { data } = await axiosNoRetry.get(makeUrl(substitue(uri, id, false)))
            return data
          } catch (err) {
            // swallow error and return empty object if unable to fetch metadata
            return {}
          }
        }
      })()

      const mediaUrl = metadata?.image ? makeUrl(metadata.image) : ''

      const mediaType = await (async () => {
        if (!mediaUrl) return

        try {
          const { headers } = await axiosNoRetry.head(mediaUrl)
          return headers['content-type']?.includes('video') ? 'video' : 'image'
        } catch (err) {
          return
        }
      })()

      return {
        name: metadata?.name ?? '',
        description: metadata?.description ?? '',
        media: {
          url: mediaUrl,
          type: mediaType,
        },
      }
    } catch (err) {
      this.logger.error(err, 'failed to fetch token metadata')

      return {
        name: '',
        description: '',
        media: { url: '' },
      }
    }
  }

  async doRpcRequest(req: RPCRequest | Array<RPCRequest>): Promise<RPCResponse | Array<RPCResponse>> {
    try {
      const config = this.rpcApiKey ? { headers: { 'api-key': this.rpcApiKey } } : undefined
      const { data } = await axiosWithRetry.post<RPCResponse>(this.rpcUrl, req, config)
      return data
    } catch (err) {
      throw handleError(err)
    }
  }
}
