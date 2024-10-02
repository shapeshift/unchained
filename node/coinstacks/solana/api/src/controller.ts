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
import { Account, PriorityFees, RawTx, Tx, TxHistory } from './models'
import { Helius } from 'helius-sdk'
import axios from 'axios'

const RPC_URL = process.env.RPC_URL
const RPC_API_KEY = process.env.RPC_API_KEY
const INDEXER_URL = process.env.INDEXER_URL

const NETWORK = process.env.NETWORK

if (!NETWORK) throw new Error('NETWORK env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')
if (!RPC_API_KEY) throw new Error('RPC_API_KEY env var not set')
if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'solana', 'api'],
  level: process.env.LOG_LEVEL,
})

const heliusSdk = new Helius(RPC_API_KEY)
heliusSdk.connection.getParsedTransactions

const axiosNoRetry = axios.create({ timeout: 5000 })

@Route('api/v1')
@Tags('v1')
export class Solana implements BaseAPI {
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
    return { pubkey } as Account
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
    const urlParams = new URLSearchParams()
    urlParams.append('api-key', RPC_API_KEY ?? '')
    urlParams.append('limit', pageSize.toString())
    if (cursor) {
      urlParams.append('before', cursor)
    }

    try {
      const { data } = await axiosNoRetry.get<RawTx[]>(
        `${INDEXER_URL}/v0/addresses/${pubkey}/transactions/?${urlParams.toString()}`
      )

      const txs = data.map((tx) => {
        return {
          txid: tx.signature,
          blockHeight: tx.slot,
          ...tx,
        }
      })

      return { pubkey, txs: txs }
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Get transaction by txid
   *
   * @param {string} txid transaction id
   *
   * @returns {Promise<Tx>} parsed transaction
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('tx/{txid}')
  async getTxById(@Path() txid: string): Promise<Tx> {
    const urlParams = new URLSearchParams()
    urlParams.append('api-key', RPC_API_KEY ?? '')

    try {
      const { data } = await axiosNoRetry.post<RawTx[]>(`${INDEXER_URL}/v0/transactions/?${urlParams.toString()}`, {
        transactions: [txid],
      })

      const rawTx = data[0]

      if (!rawTx) throw new Error('Transaction not found')

      const tx = {
        txid: rawTx.signature,
        blockHeight: rawTx.slot,
        ...rawTx,
      }

      return tx
    } catch (err) {
      throw handleError(err)
    }
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
        baseFee: Solana.baseFee,
        slow: priorityFeeLevels.low,
        average: priorityFeeLevels.medium,
        fast: priorityFeeLevels.high,
      }
    } catch (err) {
      throw handleError(err)
    }
  }
}
