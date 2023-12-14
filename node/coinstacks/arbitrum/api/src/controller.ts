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
import {
  API,
  Account,
  GasFees,
  Tx,
  TxHistory,
  GasEstimate,
  TokenMetadata,
  TokenType,
} from '../../../common/api/src/evm' // unable to import models from a module with tsoa
import { Service } from '../../../common/api/src/evm/service'
import { GasOracle } from '../../../common/api/src/evm/gasOracle'

const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const NETWORK = process.env.NETWORK
const RPC_URL = process.env.RPC_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!NETWORK) throw new Error('NETWORK env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'arbitrum', 'api'],
  level: process.env.LOG_LEVEL,
})

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL, logger })
const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
export const gasOracle = new GasOracle({ logger, provider, coinstack: 'arbitrum' })

export const service = new Service({
  blockbook,
  gasOracle,
  explorerApiUrl: 'https://api.arbiscan.io/api',
  provider,
  logger,
  rpcUrl: RPC_URL,
})

@Route('api/v1')
@Tags('v1')
export class Arbitrum extends Controller implements BaseAPI, API {
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
    balance: '25865025000000',
    unconfirmedBalance: '0',
    nonce: 5,
    pubkey: '0x9D1170D30944F2E30664Be502aC57F6096fB5366',
    tokens: [
      {
        balance: '0',
        contract: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
        decimals: 18,
        name: 'Dai Stablecoin',
        symbol: 'DAI',
        type: 'ERC20',
      },
      {
        balance: '0',
        contract: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        decimals: 6,
        name: 'Tether USD',
        symbol: 'USDT',
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
   * @param {number} [from] from block number (0 by default)
   * @param {number} [to] to block number (pending by default)
   *
   * @returns {Promise<TxHistory>} transaction history
   *
   * @example pubkey "0x9D1170D30944F2E30664Be502aC57F6096fB5366"
   */
  @Example<TxHistory>({
    pubkey: '0x9D1170D30944F2E30664Be502aC57F6096fB5366',
    cursor:
      'eyJibG9ja2Jvb2tQYWdlIjoyLCJleHBsb3JlclBhZ2UiOjEsImJsb2NrYm9va1R4aWQiOiIweGRhYjE2ODcyNWViMzYyMmQ2MTNkNWRhZWRiZmE5MTdiZWFjNGZhNTJhNWZhYzg2MDk5ZDg1ZmI3MWI1OTYyYTUiLCJibG9ja0hlaWdodCI6NzcyOTExMDV9',
    txs: [
      {
        txid: '0xdab168725eb3622d613d5daedbfa917beac4fa52a5fac86099d85fb71b5962a5',
        blockHash: '0x332643127493036faba7de88a6fb7d5e8b150d64526c1908fddbeb99fec2c674',
        blockHeight: 77291105,
        timestamp: 1680697466,
        status: 1,
        from: '0x9D1170D30944F2E30664Be502aC57F6096fB5366',
        to: '0xc0ef185cC29A3D9f36977BfA92862f833AD59e95',
        confirmations: 59521378,
        value: '4159598947212301',
        fee: '34455000000000',
        gasLimit: '446815',
        gasUsed: '344550',
        gasPrice: '100000000',
      },
    ],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}/txs')
  async getTxHistory(
    @Path() pubkey: string,
    @Query() cursor?: string,
    @Query() pageSize = 10,
    @Query() from?: number,
    @Query() to?: number
  ): Promise<TxHistory> {
    return service.getTxHistory(pubkey, cursor, pageSize, from, to)
  }

  /**
   * Get transaction details
   *
   * @param {string} txid transaction hash
   *
   * @example txid "0xdab168725eb3622d613d5daedbfa917beac4fa52a5fac86099d85fb71b5962a5"
   *
   * @returns {Promise<Tx>} transaction payload
   */
  @Example<Tx>({
    txid: '0xdab168725eb3622d613d5daedbfa917beac4fa52a5fac86099d85fb71b5962a5',
    blockHash: '0x332643127493036faba7de88a6fb7d5e8b150d64526c1908fddbeb99fec2c674',
    blockHeight: 77291105,
    timestamp: 1680697466,
    status: 1,
    from: '0x9D1170D30944F2E30664Be502aC57F6096fB5366',
    to: '0xc0ef185cC29A3D9f36977BfA92862f833AD59e95',
    confirmations: 59521508,
    value: '4159598947212301',
    fee: '34455000000000',
    gasLimit: '446815',
    gasUsed: '344550',
    gasPrice: '100000000',
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
   * @example to "0x9D1170D30944F2E30664Be502aC57F6096fB5366"
   * @example value "1337"
   */
  @Example<GasEstimate>({ gasLimit: '374764' })
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
   * * For EIP-1559 transactions, use `maxFeePerGas` and `maxPriorityFeePerGas`
   * * For Legacy transactions, use `gasPrice`
   *
   * @returns {Promise<GasFees>} current fees specified in wei
   */
  @Example<GasFees>({
    gasPrice: '100000000',
    baseFeePerGas: '100000000',
    maxPriorityFeePerGas: '0',
    slow: {
      gasPrice: '184334277',
      maxFeePerGas: '190000001',
      maxPriorityFeePerGas: '90000001',
    },
    average: {
      gasPrice: '187859277',
      maxFeePerGas: '205000001',
      maxPriorityFeePerGas: '105000001',
    },
    fast: {
      gasPrice: '199001183',
      maxFeePerGas: '290000001',
      maxPriorityFeePerGas: '190000001',
    },
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

  /**
   * Get token metadata
   *
   * @param {string} contract contract address
   * @param {string} id token identifier
   * @param {TokenType} type token type (erc721 or erc1155)
   *
   * @returns {Promise<TokenMetadata>} token metadata
   *
   * @example contractAddress "0x1E3E1ed17A8Df57C215b45f00c2eC4717B33a93D"
   * @example id "1000143"
   * @example type "erc721"
   */
  @Example<TokenMetadata>({
    name: 'Dragon 30',
    description: '',
    media: {
      url: 'https://img.momoworld.io/dragon/52.png',
      type: 'image',
    },
  })
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/metadata/token')
  async getTokenMetadata(
    @Query() contract: string,
    @Query() id: string,
    @Query() type: TokenType
  ): Promise<TokenMetadata> {
    return service.getTokenMetadata(contract, id, type)
  }
}
