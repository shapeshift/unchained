import { Logger } from '@shapeshiftoss/logger'
import { Body, Get, Path, Post, Query, Response, Route, Tags } from 'tsoa'
import {
  BadRequestError,
  BaseAPI,
  BaseInfo,
  InternalServerError,
  SendTxBody,
  ValidationError,
  handleError,
} from '../../../common/api/src' // unable to import models from a module with tsoa
import { heliusSdk } from './app'
import { NETWORK, INDEXER_URL } from './constants'
import { axiosNoRetry, getTransaction } from './utils'
import { Account, API, EstimateFeesBody, PriorityFees, TokenBalance, Tx, TxHistory } from './models'
import { DAS, EnrichedTransaction, Interface } from 'helius-sdk'
import { VersionedMessage } from '@solana/web3.js'
import { validatePageSize } from '@shapeshiftoss/common-api'
import { NativeBalance } from './types'

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'solana', 'api'],
  level: process.env.LOG_LEVEL,
})

@Route('api/v1')
@Tags('v1')
export class Solana implements BaseAPI, API {
  static baseFee = 5000

  /**
   * Get information about the running coinstack
   *
   * @returns {Promise<BaseInfo>} coinstack info
   */
  @Get('info/')
  async getInfo(): Promise<BaseInfo> {
    return {
      network: NETWORK as string,
    }
  }

  /**
   * Get account details by address or extended public key
   *
   * @param {string} pubkey account address or extended public key
   *
   * @returns {Promise<Account>} account details
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}')
  async getAccount(@Path() pubkey: string): Promise<Account> {
    try {
      let page = 1
      let balance = '0'
      let hasMore = false
      let tokens: Array<TokenBalance> = []

      do {
        const { total, limit, items, nativeBalance } = (await heliusSdk.rpc.getAssetsByOwner({
          ownerAddress: pubkey,
          page: page++,
          displayOptions: { showFungible: true, showNativeBalance: true, showZeroBalance: true },
        })) as DAS.GetAssetResponseList & { nativeBalance: NativeBalance }

        hasMore = total === limit
        balance = BigInt(nativeBalance.lamports).toString()

        tokens = items.reduce<Array<TokenBalance>>((prev, item) => {
          if (!item.content) return prev
          if (item.interface !== Interface.FUNGIBLE_TOKEN) return prev

          prev.push({
            id: item.id,
            name: item.content.metadata.name,
            symbol: item.content.metadata.symbol,
            decimals: item.token_info?.decimals ?? 0,
            balance: item.token_info?.balance ? BigInt(item.token_info.balance).toString() : '0',
            type: item.interface,
          })

          return prev
        }, tokens)
      } while (hasMore)

      return {
        pubkey,
        balance,
        unconfirmedBalance: '0',
        tokens,
      }
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Get transaction history by address
   *
   * @param {string} pubkey account address
   * @param {string} [cursor] the cursor returned in previous query (used as lastSignature)
   * @param {number} [pageSize] page size (10 by default)
   *
   * @returns {Promise<TxHistory>} transaction history
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}/txs')
  async getTxHistory(@Path() pubkey: string, @Query() cursor?: string, @Query() pageSize = 10): Promise<TxHistory> {
    validatePageSize(pageSize)

    try {
      const { data } = await axiosNoRetry.get<EnrichedTransaction[]>(
        `${INDEXER_URL}/v0/addresses/${pubkey}/transactions/`,
        {
          params: {
            limit: pageSize,
            before: cursor,
          },
        }
      )

      const txs = data.map((tx) => {
        return {
          txid: tx.signature,
          blockHeight: tx.slot,
          ...tx,
        }
      })

      const nextCursor = txs.length ? txs[txs.length - 1].signature : undefined

      return { pubkey, cursor: nextCursor, txs: txs }
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Get transaction details
   *
   * @param {string} txid transaction signature
   *
   * @returns {Promise<Tx>} transaction payload
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('tx/{txid}')
  async getTransaction(@Path() txid: string): Promise<Tx> {
    return getTransaction(txid)
  }

  /**
   * Sends raw transaction to be broadcast to the node.
   *
   * @param {SendTxBody} body serialized raw transaction (base64 encoded)
   *
   * @returns {Promise<string>} transaction signature
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('send/')
  async sendTx(@Body() body: SendTxBody): Promise<string> {
    try {
      const txSig = await heliusSdk.connection.sendRawTransaction(Buffer.from(body.hex, 'base64'))

      return txSig
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Get the current recommended priority fees for a transaction to land
   *
   * @returns {Promise<PriorityFees>} current priority fees specified in micro-lamports
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/fees/priority')
  async getPriorityFees(): Promise<PriorityFees> {
    try {
      const { priorityFeeLevels } = await heliusSdk.rpc.getPriorityFeeEstimate({
        options: { includeAllPriorityFeeLevels: true },
      })

      if (!priorityFeeLevels) throw new Error('failed to get priority fees')

      return {
        baseFee: Solana.baseFee,
        slow: priorityFeeLevels.low,
        average: priorityFeeLevels.medium,
        fast: priorityFeeLevels.high,
      }
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Get the estimated compute unit cost of a transaction
   *
   * @param {EstimateFeesBody} body transaction message (base64 encoded)
   *
   * @returns {Promise<number>} estimated compute unit cost
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('/fees/estimate')
  async getEstimateFees(@Body() body: EstimateFeesBody): Promise<number> {
    try {
      const deserializedMessage = VersionedMessage.deserialize(Buffer.from(body.message, 'base64'))

      const { value } = await heliusSdk.connection.getFeeForMessage(deserializedMessage)

      if (!value) throw new Error('Failed to get estimated fee')

      return value
    } catch (err) {
      throw handleError(err)
    }
  }
}
