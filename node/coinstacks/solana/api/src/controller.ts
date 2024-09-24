import { Logger } from '@shapeshiftoss/logger'
import { Body, Get, Path, Post, Query, Response, Route, Tags } from 'tsoa'
import {
  BadRequestError,
  BaseAPI,
  BaseInfo,
  InternalServerError,
  SendTxBody,
  ValidationError,
} from '../../../common/api/src' // unable to import models from a module with tsoa
import { Account, TxHistory } from './models'

const NETWORK = process.env.NETWORK

if (!NETWORK) throw new Error('NETWORK env var not set')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'solana', 'api'],
  level: process.env.LOG_LEVEL,
})

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendTx(@Body() _body: SendTxBody): Promise<string> {
    return ''
  }
}
