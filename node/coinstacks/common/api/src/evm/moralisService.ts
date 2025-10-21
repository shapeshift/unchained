import { EvmChain } from '@moralisweb3/common-evm-utils'
import { CreateStreamEvmRequest, EvmStreamResult } from '@moralisweb3/common-streams-utils'
import { Logger } from '@shapeshiftoss/logger'
import axios from 'axios'
import BigNumber from 'bignumber.js'
import Moralis from 'moralis'
import PQueue from 'p-queue'
import { v4 } from 'uuid'
import { getAddress, isHex, parseUnits, PublicClient, toHex } from 'viem'
import type { BaseAPI, EstimateGasBody, RPCRequest, RPCResponse, SendTxBody, SubscriptionClient } from '..'
import { createAxiosRetry, exponentialDelay, handleError, rpcId, validatePageSize } from '../utils'
import type { Account, API, Tx, TxHistory, GasFees, InternalTx, GasEstimate, TokenMetadata } from './models'
import { Fees, TokenBalance, TokenTransfer, TokenType } from './models'
import type { BlockNativeResponse, TraceCall } from './types'
import { formatAddress } from '.'

const INDEXER_URL = process.env.INDEXER_URL as string
const INDEXER_API_KEY = process.env.INDEXER_API_KEY as string
const BLOCKNATIVE_API_KEY = process.env.BLOCKNATIVE_API_KEY as string
const ENVIRONMENT = process.env.ENVIRONMENT as string
const WEBHOOK_URL = process.env.WEBHOOK_URL as string

const axiosNoRetry = axios.create({ timeout: 5000 })
const axiosWithRetry = createAxiosRetry({}, { timeout: 10000 })

type TransactionHandler = (tx: Tx) => Promise<void>

export interface MoralisServiceArgs {
  chain: EvmChain
  logger: Logger
  client: PublicClient
  rpcUrl: string
}

export class MoralisService implements Omit<BaseAPI, 'getInfo'>, API, SubscriptionClient {
  private readonly chain: EvmChain
  private readonly logger: Logger
  private readonly client: PublicClient
  private readonly rpcUrl: string

  private secret?: string
  private streamId?: string
  private queue = new PQueue({ concurrency: 1 })

  transactionHandler?: TransactionHandler

  constructor(args: MoralisServiceArgs) {
    if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
    if (!INDEXER_API_KEY) throw new Error('INDEXER_API_KEY env var not set')
    if (!BLOCKNATIVE_API_KEY) throw new Error('BLOCKNATIVE_API_KEY env var not set')
    if (!WEBHOOK_URL) throw new Error('WEBHOOK_URL env var not set')
    if (!ENVIRONMENT) throw new Error('ENVIRONMENT env var not set')

    this.chain = args.chain
    this.logger = args.logger.child({ namespace: ['moralisService'] })
    this.client = args.client
    this.rpcUrl = args.rpcUrl

    void Moralis.start({ evmApiBaseUrl: INDEXER_URL, apiKey: INDEXER_API_KEY })
  }

  private async initializeStream() {
    try {
      const stream: CreateStreamEvmRequest = {
        chains: [this.chain],
        description: `${this.chain.display()} - ${ENVIRONMENT}`,
        tag: v4(),
        webhookUrl: WEBHOOK_URL,
        includeNativeTxs: true,
        includeInternalTxs: true,
        includeContractLogs: true,
      }

      const currentStream = await Moralis.Streams.add(stream)

      await Moralis.Streams.delete({ id: currentStream.result.id, networkType: 'evm' })

      const newStream = await Moralis.Streams.add(stream)

      this.streamId = newStream.result.id
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error({ error: err.message }, 'Failed to initialize MoralisService')
      } else {
        this.logger.error('Failed to initialize MoralisService')
      }
      process.exit(1)
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
      const { pagination, result } = await Moralis.EvmApi.wallets.getWalletHistory({
        address: pubkey,
        chain: this.chain,
        cursor: cursor,
        fromBlock: from,
        includeInputData: true,
        includeInternalTransactions: true,
        limit: pageSize,
        order: 'DESC',
        toBlock: to,
      })

      if (!result.length) {
        return {
          pubkey: pubkey,
          txs: [],
        }
      }

      const currentBlock = await this.client.getBlockNumber()

      const txs = result.reduce<Array<Tx>>((prev, tx) => {
        const isNftOnly =
          tx.nftTransfers.length &&
          !tx.erc20Transfers.length &&
          !tx.nativeTransfers.length &&
          !tx.internalTransactions?.length

        const isInvalid =
          !tx.nftTransfers.length &&
          !tx.erc20Transfers.length &&
          !tx.nativeTransfers.length &&
          !tx.internalTransactions?.length

        if (isNftOnly || isInvalid) return prev

        const tokenTransfers = tx.erc20Transfers.map<TokenTransfer>((transfer) => ({
          from: transfer.fromAddress.checksum,
          to: transfer.toAddress?.checksum ?? '',
          value: transfer.value,
          contract: transfer.address.checksum,
          decimals: transfer.tokenDecimals,
          name: transfer.tokenName,
          symbol: transfer.tokenSymbol,
          type: 'ERC20',
        }))

        const internalTxs = tx.internalTransactions?.map<InternalTx>((tx) => ({
          from: tx.from.checksum,
          to: tx.to.checksum,
          value: tx.value.toString(),
        }))

        prev.push({
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
      }, [])

      return { pubkey, txs, cursor: pagination.cursor }
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
      const { data } = await axiosNoRetry.get<BlockNativeResponse>(
        'https://api.blocknative.com/gasprices/blockprices',
        {
          headers: {
            Authorization: BLOCKNATIVE_API_KEY,
          },
          params: {
            chainid: this.chain.decimal,
            confidenceLevels: [50, 70, 95],
          },
          paramsSerializer: { indexes: null },
        }
      )

      const blockPrices = data.blockPrices[0]

      const estimatedFees = Object.fromEntries<Fees>(
        blockPrices.estimatedPrices.map((v) => [
          v.confidence,
          {
            gasPrice: BigNumber(v.price).times(1e9).toFixed(0),
            maxFeePerGas: BigNumber(v.maxFeePerGas).times(1e9).toFixed(0),
            maxPriorityFeePerGas: BigNumber(v.maxPriorityFeePerGas).times(1e9).toFixed(0),
          },
        ])
      )

      return {
        baseFeePerGas: BigNumber(blockPrices.baseFeePerGas).times(1e9).toFixed(0),
        slow: estimatedFees['50'],
        average: estimatedFees['70'],
        fast: estimatedFees['95'],
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

      const { data } = await axiosNoRetry.post<RPCResponse>(this.rpcUrl, request)

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

  /**
   * format transaction and call trace_transaction to extract internal transactions on newly confirmed transactions only.
   *
   * __not suitable for use on historical transactions when using a full node as the evm state is purged__
   */
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

  async getTokenMetadata(address: string, id: string, type: TokenType): Promise<TokenMetadata> {
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
      const data = await Moralis.EvmApi.nft.getNFTMetadata({
        address,
        tokenId: id,
        chain: this.chain,
        format: 'decimal',
      })

      if (!data || !data.raw.normalized_metadata || data.result.contractType !== type.toUpperCase()) {
        throw new Error(`Metadata for ${address} (${id}) not found`)
      }

      const { contractType } = data.result
      const { description, name, image, animation_url } = data.raw.normalized_metadata

      const mediaUrl = makeUrl(animation_url || image || '')

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
        address,
        id,
        name: name ?? '',
        description: description ?? '',
        type: contractType,
        media: {
          url: mediaUrl,
          type: mediaType,
        },
      }
    } catch (err) {
      throw handleError(err)
    }
  }

  async doRpcRequest(req: RPCRequest | Array<RPCRequest>): Promise<RPCResponse | Array<RPCResponse>> {
    try {
      const { data } = await axiosWithRetry.post<RPCResponse>(this.rpcUrl, req)
      return data
    } catch (err) {
      throw handleError(err)
    }
  }

  subscribeAddresses(_: Array<string>, addressesToAdd: Array<string>): void {
    if (!addressesToAdd.length) return

    this.queue.add(async () => {
      try {
        if (!this.streamId) await this.initializeStream()

        await Moralis.Streams.addAddress({
          id: this.streamId!,
          address: addressesToAdd,
        })
      } catch (err) {
        if (err instanceof Error) {
          this.logger.error({ error: err.message, addresses: addressesToAdd }, 'failed to subscribe addresses')
        } else {
          this.logger.error({ addresses: addressesToAdd }, 'failed to subscribe addresses')
        }
      }
    })
  }

  unsubscribeAddresses(_: Array<string>, addressesToRemove: Array<string>): void {
    if (!addressesToRemove.length) return

    this.queue.add(async () => {
      try {
        if (!this.streamId) await this.initializeStream()

        await Moralis.Streams.deleteAddress({
          id: this.streamId!,
          address: addressesToRemove,
        })
      } catch (err) {
        if (err instanceof Error) {
          this.logger.error({ error: err.message, addresses: addressesToRemove }, 'failed to unsubscribe addresses')
        } else {
          this.logger.error({ addresses: addressesToRemove }, 'failed to unsubscribe addresses')
        }
      }
    })
  }
}
