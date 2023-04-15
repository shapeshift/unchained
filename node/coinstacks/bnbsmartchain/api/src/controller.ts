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
import { API, Account, GasFees, Tx, TxHistory, GasEstimate } from '../../../common/api/src/evm' // unable to import models from a module with tsoa
import { Service } from '../../../common/api/src/evm/service'

const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const NETWORK = process.env.NETWORK
const RPC_URL = process.env.RPC_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!NETWORK) throw new Error('NETWORK env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'bnbsmartchain', 'api'],
  level: process.env.LOG_LEVEL,
})

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })
const provider = new ethers.JsonRpcProvider(RPC_URL)

export const service = new Service({
  blockbook,
  explorerApiUrl: 'https://api.bscscan.com/api',
  provider,
  logger,
  rpcUrl: RPC_URL,
})

@Route('api/v1')
@Tags('v1')
export class BNBSmartChain extends Controller implements BaseAPI, API {
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
   * @example pubkey "0xC480394241c76F3993ec5D121ce4F198f7844443"
   */
  @Example<Account>({
    balance: '294505451261967226',
    unconfirmedBalance: '0',
    nonce: 74,
    pubkey: '0xC480394241c76F3993ec5D121ce4F198f7844443',
    tokens: [
      {
        balance: '0',
        contract: '0x04756126F044634C9a0f0E985e60c88a51ACC206',
        decimals: 18,
        name: 'Carbon',
        symbol: 'CSIX',
        type: 'BEP20',
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
   * @example pubkey "0xC480394241c76F3993ec5D121ce4F198f7844443"
   */
  @Example<TxHistory>({
    pubkey: '0xC480394241c76F3993ec5D121ce4F198f7844443',
    cursor:
      'eyJibG9ja2Jvb2tQYWdlIjoxLCJleHBsb3JlclBhZ2UiOjEsImV4cGxvcmVyVHhpZCI6IjB4MTVkODlmMTdmOWQ2NmZiM2VkMTIwZTc3Mjc0NWQ1MTIzODQ3ZGY3MjM2N2EyNWMwNGUzYWRjY2JlYjgwM2FiMyIsImJsb2NrYm9va1R4aWQiOiIweDJkZjdkZTM1ZTk1NmE3ZTY1M2M1YTE3Mjc2NzM5ZGViNmY0NGUzOGZlMDRiMmUxYjcwYTc2ZmE4YjA2NWNkYjIiLCJibG9ja0hlaWdodCI6MjU4Mzk1Njl9',
    txs: [
      {
        txid: '0x025b88d4b35e1fd28ee372deb1cb28c2c862703dce444629c47e27b8b8759cc4',
        blockHash: '0x695b9e8a01b9564387bde6d52fd2775867c7b56ee0c1a9d61bbcc2b38a9c835f',
        blockHeight: 25839827,
        timestamp: 1676923869,
        status: 1,
        from: '0xC480394241c76F3993ec5D121ce4F198f7844443',
        to: '0x215B8E1810Bb8FCcf2D90eE87631F16B5F4a895f',
        confirmations: 50,
        value: '1200000000000000000',
        fee: '105000000000000',
        gasLimit: '21000',
        gasUsed: '21000',
        gasPrice: '5000000000',
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
   * @example txid "0x025b88d4b35e1fd28ee372deb1cb28c2c862703dce444629c47e27b8b8759cc4"
   *
   * @returns {Promise<Tx>} transaction payload
   */
  @Example<Tx>({
    txid: '0x025b88d4b35e1fd28ee372deb1cb28c2c862703dce444629c47e27b8b8759cc4',
    blockHash: '0x695b9e8a01b9564387bde6d52fd2775867c7b56ee0c1a9d61bbcc2b38a9c835f',
    blockHeight: 25839827,
    timestamp: 1676923869,
    status: 1,
    from: '0xC480394241c76F3993ec5D121ce4F198f7844443',
    to: '0x215B8E1810Bb8FCcf2D90eE87631F16B5F4a895f',
    confirmations: 50,
    value: '1200000000000000000',
    fee: '105000000000000',
    gasLimit: '21000',
    gasUsed: '21000',
    gasPrice: '5000000000',
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
   * @returns {Promise<GasEstimate>} estimated gas cost
   *
   * @example data "0x"
   * @example from "0x0000000000000000000000000000000000000000"
   * @example to "0xC480394241c76F3993ec5D121ce4F198f7844443"
   * @example value "1337"
   */
  @Example<GasEstimate>({ gasLimit: '21000' })
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/estimate')
  async estimateGas(
    @Query() data: string,
    @Query() from: string,
    @Query() to: string,
    @Query() value: string
  ): Promise<GasEstimate> {
    return service.estimateGas(data, from, to, value)
  }

  /**
   * Get the current recommended gas fees to use in a transaction
   *
   * @returns {Promise<GasFees>} current fees specified in wei
   */
  @Example<GasFees>({
    gasPrice: '5000000000',
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
