import { Body, Controller, Get, Path, Post, Query, Response, Route, Tags } from 'tsoa'
import { BadRequestError, BaseAPI, BaseInfo, InternalServerError, SendTxBody, ValidationError } from '../'
import { API, Account, Tx, RawTx, NetworkFees, Utxo, TxHistory } from './models'
import { Service } from './service'

declare global {
  // eslint-disable-next-line no-var
  var service: Service
}

const NETWORK = process.env.NETWORK

if (!NETWORK) throw new Error('NETWORK env var not set')

@Route('api/v1')
@Tags('v1')
export class UTXO extends Controller implements BaseAPI, API {
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
   * Get account details by address or xpub
   *
   * @param {string} pubkey account address or xpub
   *
   * @returns {Promise<Account>} account details
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}')
  async getAccount(@Path() pubkey: string): Promise<Account> {
    return globalThis.service.getAccount(pubkey)
  }

  /**
   * Get transaction history by address or xpub
   *
   * @param {string} pubkey account address or xpub
   * @param {string} [cursor] the cursor returned in previous query (base64 encoded json object with a 'page' property)
   * @param {number} [pageSize] page size (10 by default)
   *
   * @returns {Promise<TxHistory>} transaction history
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}/txs')
  async getTxHistory(@Path() pubkey: string, @Query() cursor?: string, @Query() pageSize = 10): Promise<TxHistory> {
    return globalThis.service.getTxHistory(pubkey, cursor, pageSize)
  }

  /**
   * Get all unspent transaction outputs for an address or xpub
   *
   * @param {string} pubkey account address or xpub
   *
   * @returns {Promise<Array<Utxo>>} account utxos
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}/utxos')
  async getUtxos(@Path() pubkey: string): Promise<Array<Utxo>> {
    return globalThis.service.getUtxos(pubkey)
  }

  /**
   * Get transaction details
   *
   * @param {string} txid transaction hash
   *
   * @returns {Promise<Tx>} transaction payload
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('tx/{txid}')
  async getTransaction(@Path() txid: string): Promise<Tx> {
    return globalThis.service.getTransaction(txid)
  }

  /**
   * Get raw transaction details directly from the node
   *
   * @param {string} txid transaction hash
   *
   * @returns {Promise<RawTx>} transaction payload
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('tx/{txid}/raw')
  async getRawTransaction(@Path() txid: string): Promise<RawTx> {
    return globalThis.service.getRawTransaction(txid)
  }

  /**
   * Sends raw transaction to be broadcast to the node.
   *
   * @param {SendTxBody} body serialized raw transaction hex
   *
   * @returns {Promise<string>} transaction id
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('send/')
  async sendTx(@Body() body: SendTxBody): Promise<string> {
    return globalThis.service.sendTx(body)
  }

  /**
   * Get current recommended network fees to use in a transaction
   *
   * @returns {Promise<NetworkFees>} current network fees
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/fees')
  async getNetworkFees(): Promise<NetworkFees> {
    return globalThis.service.getNetworkFees()
  }
}
