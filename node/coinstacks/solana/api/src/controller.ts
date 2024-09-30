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
import { Account, PriorityFees, TxHistory } from './models'
import { Helius } from 'helius-sdk'

const RPC_URL = process.env.RPC_URL
const RPC_API_KEY = process.env.RPC_API_KEY

const NETWORK = process.env.NETWORK

if (!NETWORK) throw new Error('NETWORK env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')
if (!RPC_API_KEY) throw new Error('RPC_API_KEY env var not set')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'solana', 'api'],
  level: process.env.LOG_LEVEL,
})

const heliusSdk = new Helius(RPC_API_KEY)

@Route('api/v1')
@Tags('v1')
export class Solana implements BaseAPI {
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
    return { pubkey } as Account
  }

  /**
   * Get transaction history by address or extended public key
   *
   * @param {string} pubkey account address or extended public key
   * @param {string} [cursor] the cursor returned in previous query (base64 encoded json object with a 'page' property)
   * @param {number} [pageSize] page size (10 by default)
   *
   * @returns {Promise<TxHistory>} transaction history
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}/txs')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getTxHistory(@Path() pubkey: string, @Query() _cursor?: string, @Query() _pageSize = 10): Promise<TxHistory> {
    return { pubkey } as TxHistory
  }

  /**
   * Sends raw transaction to be broadcast to the node.
   *
   * @param {SendTxBody} body serialized raw transaction hex
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
  @Post('/fees/priority')
  async getPriorityFees(): Promise<PriorityFees> {
    try {
      const { priorityFeeLevels } = await heliusSdk.rpc.getPriorityFeeEstimate({
        options: { includeAllPriorityFeeLevels: true },
      })

      if (!priorityFeeLevels) throw new Error('failed to get priority fees')

      return {
        slow: priorityFeeLevels?.low,
        average: priorityFeeLevels?.medium,
        fast: priorityFeeLevels?.high,
      }
    } catch (err) {
      throw handleError(err)
    }
  }
}
