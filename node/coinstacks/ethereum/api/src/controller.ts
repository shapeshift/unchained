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

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY
const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const NETWORK = process.env.NETWORK
const RPC_URL = process.env.RPC_URL

if (!ETHERSCAN_API_KEY) throw new Error('ETHERSCAN_API_KEY env var not set')
if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!NETWORK) throw new Error('NETWORK env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'ethereum', 'api'],
  level: process.env.LOG_LEVEL,
})

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL, logger })
const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
export const gasOracle = new GasOracle({ logger, provider, coinstack: 'ethereum' })

export const service = new Service({
  blockbook,
  gasOracle,
  explorerApiKey: ETHERSCAN_API_KEY,
  explorerApiUrl: 'https://api.etherscan.io/api',
  provider,
  logger,
  rpcUrl: RPC_URL,
})

@Route('api/v1')
@Tags('v1')
export class Ethereum extends Controller implements BaseAPI, API {
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
   * @example pubkey "0xB3DD70991aF983Cf82d95c46C24979ee98348ffa"
   */
  @Example<Account>({
    balance: '284809805024198107',
    unconfirmedBalance: '0',
    nonce: 1,
    pubkey: '0xB3DD70991aF983Cf82d95c46C24979ee98348ffa',
    tokens: [
      {
        balance: '1337',
        contract: '0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d',
        decimals: 18,
        name: 'FOX',
        symbol: 'FOX',
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
   * @example pubkey "0xB3DD70991aF983Cf82d95c46C24979ee98348ffa"
   */
  @Example<TxHistory>({
    pubkey: '0xB3DD70991aF983Cf82d95c46C24979ee98348ffa',
    cursor:
      'eyJibG9ja2Jvb2tQYWdlIjoxLCJldGhlcnNjYW5QYWdlIjoxLCJibG9ja2Jvb2tUeGlkIjoiMHhhZWU0MzJmODUzZmRjMTNhZDlmZjZjYWJlMmEzOTQwM2Q4N2RkZWUxODQyNDk2ODE4ZmNkODg3NDdmNjU2NmY5IiwiYmxvY2tIZWlnaHQiOjEzODUwMjEzfQ==',
    txs: [
      {
        txid: '0x8e3528c933483770a3c8377c2ee7e34f846908653168188fd0d90a20b295d002',
        blockHash: '0x94228c1b7052720846e2d7b9f36de30acf45d9a06ec483bd4433c5c38c8673a8',
        blockHeight: 12267105,
        timestamp: 1618788849,
        status: 1,
        from: '0xB3DD70991aF983Cf82d95c46C24979ee98348ffa',
        to: '0x642F4Bda144C63f6DC47EE0fDfbac0a193e2eDb7',
        confirmations: 2088440,
        value: '737092621690531649',
        fee: '3180000000009000',
        gasLimit: '21000',
        gasUsed: '21000',
        gasPrice: '151428571429',
        inputData: '0x',
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
   * @example txid "0x8825fe8d60e1aa8d990f150bffe1196adcab36d0c4e98bac76c691719103b79d"
   *
   * @returns {Promise<Tx>} transaction payload
   */
  @Example<Tx>({
    txid: '0x8825fe8d60e1aa8d990f150bffe1196adcab36d0c4e98bac76c691719103b79d',
    blockHash: '0x122f1e1b594b797d96c1777ce9cdb68ddb69d262ac7f2ddc345909aba4ebabd7',
    blockHeight: 14813163,
    timestamp: 1653078780,
    status: 1,
    from: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8',
    to: '0x275C7d416c1DBfafa53A861EEc6F0AD6138ca4dD',
    confirmations: 21,
    value: '49396718157429775',
    fee: '603633477678000',
    gasLimit: '250000',
    gasUsed: '21000',
    gasPrice: '28744451318',
    inputData: '0x',
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
   * @example to "0x642F4Bda144C63f6DC47EE0fDfbac0a193e2eDb7"
   * @example value "1337"
   */
  @Example<GasEstimate>({ gasLimit: '26540' })
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
    gasPrice: '77125288868',
    baseFeePerGas: '77654025212',
    maxPriorityFeePerGas: '94000001',
    slow: {
      gasPrice: '77109280451',
      maxFeePerGas: '77744243213',
      maxPriorityFeePerGas: '90218001',
    },
    average: {
      gasPrice: '78637140239',
      maxFeePerGas: '79158075213',
      maxPriorityFeePerGas: '1504050001',
    },
    fast: {
      gasPrice: '85079071846',
      maxFeePerGas: '89883761218',
      maxPriorityFeePerGas: '12229736006',
    },
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/fees')
  async getGasFees(): Promise<GasFees> {
    return service.getGasFees()
  }

  /**
   * Sends raw transaction to be broadcast to the node.
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
   * @example contractAddress "0x4Db1f25D3d98600140dfc18dEb7515Be5Bd293Af"
   * @example id "3150"
   * @example type "erc721"
   */
  @Example<TokenMetadata>({
    name: 'HAPE #3150',
    description: '8192 next-generation, high-fashion HAPES.',
    media: {
      url: 'https://meta.hapeprime.com/3150.png',
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
