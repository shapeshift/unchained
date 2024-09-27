import { Logger } from '@shapeshiftoss/logger'
import { Body, Example, Get, Path, Post, Query, Response, Route, Tags } from 'tsoa'
import {
  BadRequestError,
  BaseAPI,
  BaseInfo,
  InternalServerError,
  SendTxBody,
  ValidationError,
  handleError,
} from '../../../common/api/src' // unable to import models from a module with tsoa
import { Account, EstimatePriorityFeeBody, GasFees, GasFeesBody, TxHistory } from './models'
import { Helius } from 'helius-sdk'
import { Message } from '@solana/web3.js'

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
  static baseFee = '5000'
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
   * Estimate priority fees for a transaction
   *
   * @param {SendTxBody} body to account keys
   *
   * @returns {Promise<number | undefined>} priority fee estimate
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('/estimate-priority-fee')
  async estimatePriorityFee(@Body() body: EstimatePriorityFeeBody): Promise<number | undefined> {
    try {
      const feeEstimate = await heliusSdk.rpc.getPriorityFeeEstimate({
        accountKeys: body.accountKeys,
        options: {
          recommended: true,
        },
      })

      return feeEstimate.priorityFeeEstimate
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Get the current recommended gas fees to use in a transaction
   *
   * @returns {Promise<GasFees>} current fees specified in wei
   */
  @Example<GasFees>({
    baseFee: '5000',
    gasPrice: '7000',
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('/gas/fees')
  async getGasFees(@Body() body: GasFeesBody): Promise<GasFees> {
    try {
      const deserializedMessage = Message.from(Buffer.from(body.message, 'base64'))

      const feeResult = await heliusSdk.connection.getFeeForMessage(deserializedMessage)
      console.log(feeResult)
      const gasPrice = feeResult.value

      if (!gasPrice) {
        throw new Error('Failed to get gas price')
      }

      return {
        baseFee: Solana.baseFee,
        gasPrice: gasPrice.toFixed(),
      }
    } catch (err) {
      throw handleError(err)
    }
  }
}
