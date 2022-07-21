import { ethers } from 'ethers'
import { Body, Controller, Example, Get, Path, Post, Query, Response, Route, Tags } from 'tsoa'
import { Blockbook } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'
import {
  BadRequestError,
  BaseAPI,
  BaseInfo,
  InternalServerError,
  SendTxBody,
  ValidationError,
} from '../../../common/api/src' // unable to import models from a module with tsoa
import { API, Account, GasFees, Service, Tx, TxHistory } from '../../../common/api/src/evm' // unable to import models from a module with tsoa

const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const NETWORK = process.env.NETWORK
const RPC_URL = process.env.RPC_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!NETWORK) throw new Error('NETWORK env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'avalanche', 'api'],
  level: process.env.LOG_LEVEL,
})

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })
const provider = new ethers.providers.JsonRpcProvider(RPC_URL)

export const service = new Service({
  blockbook,
  explorerApiUrl: 'https://api.snowtrace.io/api',
  provider,
  logger,
  rpcUrl: RPC_URL,
})

@Route('api/v1')
@Tags('v1')
export class Avalanche extends Controller implements BaseAPI, API {
  /**
   * Get information about the running coinstack
   *
   * @returns {Promise<BaseInfo>} coinstack info
   */
  @Example<BaseInfo>({
    network: 'mainnet',
  })
  @Get('info/')
  async getInfo(): Promise<BaseInfo> {
    return {
      network: NETWORK as string,
    }
  }

  /**
   * Get account details by address
   *
   * @param {string} pubkey account address
   *
   * @returns {Promise<Account>} account details
   *
   * @example pubkey "0x9D1170D30944F2E30664Be502aC57F6096fB5366"
   */
  @Example<Account>({
    balance: '183750000000000',
    unconfirmedBalance: '0',
    nonce: 322,
    pubkey: '0x9D1170D30944F2E30664Be502aC57F6096fB5366',
    tokens: [
      {
        balance: '1337',
        contract: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',
        decimals: 18,
        name: 'Wrapped Ether',
        symbol: 'WETH.e',
        type: 'ERC20',
      },
    ],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}')
  async getAccount(@Path() pubkey: string): Promise<Account> {
    return service.getAccount(pubkey)
  }

  /**
   * Get transaction history by address
   *
   * @param {string} pubkey account address
   * @param {string} [cursor] the cursor returned in previous query (base64 encoded json object with a 'page' property)
   * @param {number} [pageSize] page size (10 by default)
   *
   * @returns {Promise<TxHistory>} transaction history
   *
   * @example pubkey "0x9D1170D30944F2E30664Be502aC57F6096fB5366"
   */
  @Example<TxHistory>({
    pubkey: '0x9D1170D30944F2E30664Be502aC57F6096fB5366',
    cursor:
      'eyJibG9ja2Jvb2tQYWdlIjoyLCJleHBsb3JlclBhZ2UiOjEsImJsb2NrYm9va1R4aWQiOiIweDE0YTZlYTA4MWRhYWI1OWI1ZGQ3YTE3NjQ4YTAwNGU5Y2EzNzdhNWVkMmE5N2E4NGUyYWQ4MDVkZjJlMjUzM2QiLCJibG9ja0hlaWdodCI6MTc1MTIxNjR9',
    txs: [
      {
        txid: '0x14a6ea081daab59b5dd7a17648a004e9ca377a5ed2a97a84e2ad805df2e2533d',
        blockHash: '0x748fff248d4a033c28cb6cc45b78ad7f471ac4d958971570e3e3afe4e0f84c1f',
        blockHeight: 17512164,
        timestamp: 1658197214,
        status: 1,
        from: '0xa3682Fe8fD73B90A7564585A436EC2D2AEb612eE',
        to: '0x9D1170D30944F2E30664Be502aC57F6096fB5366',
        confirmations: 119004,
        value: '410000000000000000',
        fee: '525000000000000',
        gasLimit: '21000',
        gasUsed: '21000',
        gasPrice: '25000000000',
      },
    ],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}/txs')
  async getTxHistory(@Path() pubkey: string, @Query() cursor?: string, @Query() pageSize = 10): Promise<TxHistory> {
    return service.getTxHistory(pubkey, cursor, pageSize)
  }

  /**
   * Get transaction details
   *
   * @param {string} txid transaction hash
   *
   * @example txid "0x14a6ea081daab59b5dd7a17648a004e9ca377a5ed2a97a84e2ad805df2e2533d"
   *
   * @returns {Promise<Tx>} transaction payload
   */
  @Example<Tx>({
    txid: '0x14a6ea081daab59b5dd7a17648a004e9ca377a5ed2a97a84e2ad805df2e2533d',
    blockHash: '0x748fff248d4a033c28cb6cc45b78ad7f471ac4d958971570e3e3afe4e0f84c1f',
    blockHeight: 17512164,
    timestamp: 1658197214,
    status: 1,
    from: '0xa3682Fe8fD73B90A7564585A436EC2D2AEb612eE',
    to: '0x9D1170D30944F2E30664Be502aC57F6096fB5366',
    confirmations: 119004,
    value: '410000000000000000',
    fee: '525000000000000',
    gasLimit: '21000',
    gasUsed: '21000',
    gasPrice: '25000000000',
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('tx/{txid}')
  async getTransaction(@Path() txid: string): Promise<Tx> {
    return service.getTransaction(txid)
  }

  /**
   * Get the estimated gas cost of a transaction
   *
   * @param {string} data input data
   * @param {string} from from address
   * @param {string} to to address
   * @param {string} value transaction value in wei
   *
   * @returns {Promise<string>} estimated gas cost
   *
   * @example data "0x"
   * @example from "0x0000000000000000000000000000000000000000"
   * @example to "0x9D1170D30944F2E30664Be502aC57F6096fB5366"
   * @example value "1337"
   */
  @Example<string>('21000')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/estimate')
  async estimateGas(
    @Query() data: string,
    @Query() from: string,
    @Query() to: string,
    @Query() value: string
  ): Promise<string> {
    return service.estimateGas(data, from, to, value)
  }

  /**
   * Get the current recommended gas fees to use in a transaction
   *
   * * For EIP-1559 transactions, use `maxFeePerGas` and `maxPriorityFeePerGas`
   * * For Legacy transactions, use `gasPrice`
   *
   * @returns {Promise<GasFees>} current fees specified in wei
   */
  @Example<GasFees>({
    gasPrice: '25000000000',
    maxFeePerGas: '51500000000',
    maxPriorityFeePerGas: '1500000000',
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/fees')
  async getGasFees(): Promise<GasFees> {
    return service.getGasFees()
  }

  /**
   * Broadcast signed raw transaction
   *
   * @param {SendTxBody} body serialized raw transaction hex
   *
   * @returns {Promise<string>} transaction id
   *
   * @example body {
   *    "hex": "0xf86c0a85046c7cfe0083016dea94d1310c1e038bc12865d3d3997275b3e4737c6302880b503be34d9fe80080269fc7eaaa9c21f59adf8ad43ed66cf5ef9ee1c317bd4d32cd65401e7aaca47cfaa0387d79c65b90be6260d09dcfb780f29dd8133b9b1ceb20b83b7e442b4bfc30cb"
   * }
   */
  @Example<string>('0xb9d4ad5408f53eac8627f9ccd840ba8fb3469d55cd9cc2a11c6e049f1eef4edd')
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('send/')
  async sendTx(@Body() body: SendTxBody): Promise<string> {
    return service.sendTx(body)
  }
}
