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
  namespace: ['unchained', 'coinstacks', 'polygon', 'api'],
  level: process.env.LOG_LEVEL,
})

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })
const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
export const gasOracle = new GasOracle({ logger, provider, coinstack: 'polygon' })

export const service = new Service({
  blockbook,
  gasOracle,
  explorerApiUrl: 'https://api.polygonscan.com/api',
  provider,
  logger,
  rpcUrl: RPC_URL,
})

@Route('api/v1')
@Tags('v1')
export class Polygon extends Controller implements BaseAPI, API {
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
   * @example pubkey "0x3f758726E31b299Afb85b3D5C8B1fEc9b20b17cA"
   */
  @Example<Account>({
    balance: '5509799116755998875',
    unconfirmedBalance: '0',
    nonce: 6,
    pubkey: '0x3f758726E31b299Afb85b3D5C8B1fEc9b20b17cA',
    tokens: [
      {
        balance: '504032777',
        contract: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        decimals: 6,
        name: 'USD Coin (PoS)',
        symbol: 'USDC',
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
   * @example pubkey "0x3f758726E31b299Afb85b3D5C8B1fEc9b20b17cA"
   */
  @Example<TxHistory>({
    pubkey: '0x3f758726E31b299Afb85b3D5C8B1fEc9b20b17cA',
    cursor:
      'eyJibG9ja2Jvb2tQYWdlIjozLCJleHBsb3JlclBhZ2UiOjEsImJsb2NrYm9va1R4aWQiOiIweGQwYzIwZmRlM2JmNWQ5NmNkNTdkN2E3MDJkYzAwYjI0ODNlOTRhZTQ0YTM0NjU3YTQzZGZkZTIyNDBmNDljNjYiLCJleHBsb3JlclR4aWQiOiIweGQwYzIwZmRlM2JmNWQ5NmNkNTdkN2E3MDJkYzAwYjI0ODNlOTRhZTQ0YTM0NjU3YTQzZGZkZTIyNDBmNDljNjYiLCJibG9ja0hlaWdodCI6NDE2Mjg3MjB9',
    txs: [
      {
        txid: '0x8207404cac0b02ed15dd2690fcfb618a7d7b0482e12345e4483fed398f073890',
        blockHash: '0x00561abfd4c6a15fbeae39a1223b0a0ffbd9a4eb22e902c7b0e551049a33b2c0',
        blockHeight: 41639607,
        timestamp: 1681745623,
        status: 1,
        from: '0xe93685f3bBA03016F02bD1828BaDD6195988D950',
        to: '0x75dC8e5F50C8221a82CA6aF64aF811caA983B65f',
        confirmations: 155,
        value: '0',
        fee: '94583813568181480',
        gasLimit: '1200108',
        gasUsed: '223268',
        gasPrice: '423633541610',
        inputData:
          '0x252f7b0100000000000000000000000000000000000000000000000000000000000000700000000000000000000000009d1b1669c73b033dfe47ae5a0164ab96df25b944000000000000000000000000000000000000000000000000000000000003b920cb300a75b8df105ca88a050fa3480cd5e139b4dde3387beddfcdf2f9b31e8638cb300a75b8df105ca88a050fa3480cd5e139b4dde3387beddfcdf2f9b31e863800000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000002740000000000000000000000004d73adb72bc3dd368966edd0f0b2148401a178e200000000000190b3007045a01e4e04f14f7a4a6702c74187c5f6222033cd006d9d1b1669c73b033dfe47ae5a0164ab96df25b944000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000249f00000000000000000000000000000000000000000000000000000017d7309b7ab000000000000000000000000000000000000000000000000000000001e0aee090000000000000000000000000000000000000000000000000000000000003b1a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000462ee000000000000000000000000000000000000000000000000000000001e0f8c1100000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000143f758726e31b299afb85b3d5c8b1fec9b20b17ca0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
        tokenTransfers: [
          {
            contract: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            decimals: 6,
            name: 'USD Coin (PoS)',
            symbol: 'USDC',
            type: 'ERC20',
            from: '0x1205f31718499dBf1fCa446663B532Ef87481fe1',
            to: '0x3f758726E31b299Afb85b3D5C8B1fEc9b20b17cA',
            value: '504032777',
          },
        ],
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
   * @example txid "0x8207404cac0b02ed15dd2690fcfb618a7d7b0482e12345e4483fed398f073890"
   *
   * @returns {Promise<Tx>} transaction payload
   */
  @Example<Tx>({
    txid: '0x8207404cac0b02ed15dd2690fcfb618a7d7b0482e12345e4483fed398f073890',
    blockHash: '0x00561abfd4c6a15fbeae39a1223b0a0ffbd9a4eb22e902c7b0e551049a33b2c0',
    blockHeight: 41639607,
    timestamp: 1681745623,
    status: 1,
    from: '0xe93685f3bBA03016F02bD1828BaDD6195988D950',
    to: '0x75dC8e5F50C8221a82CA6aF64aF811caA983B65f',
    confirmations: 193,
    value: '0',
    fee: '94583813568181480',
    gasLimit: '1200108',
    gasUsed: '223268',
    gasPrice: '423633541610',
    inputData:
      '0x252f7b0100000000000000000000000000000000000000000000000000000000000000700000000000000000000000009d1b1669c73b033dfe47ae5a0164ab96df25b944000000000000000000000000000000000000000000000000000000000003b920cb300a75b8df105ca88a050fa3480cd5e139b4dde3387beddfcdf2f9b31e8638cb300a75b8df105ca88a050fa3480cd5e139b4dde3387beddfcdf2f9b31e863800000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000002740000000000000000000000004d73adb72bc3dd368966edd0f0b2148401a178e200000000000190b3007045a01e4e04f14f7a4a6702c74187c5f6222033cd006d9d1b1669c73b033dfe47ae5a0164ab96df25b944000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000249f00000000000000000000000000000000000000000000000000000017d7309b7ab000000000000000000000000000000000000000000000000000000001e0aee090000000000000000000000000000000000000000000000000000000000003b1a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000462ee000000000000000000000000000000000000000000000000000000001e0f8c1100000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000143f758726e31b299afb85b3d5c8b1fec9b20b17ca0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    tokenTransfers: [
      {
        contract: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        decimals: 6,
        name: 'USD Coin (PoS)',
        symbol: 'USDC',
        type: 'ERC20',
        from: '0x1205f31718499dBf1fCa446663B532Ef87481fe1',
        to: '0x3f758726E31b299Afb85b3D5C8B1fEc9b20b17cA',
        value: '504032777',
      },
    ],
    internalTxs: [],
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
   * @example to "0x3f758726E31b299Afb85b3D5C8B1fEc9b20b17cA"
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
   * * For EIP-1559 transactions, use `maxFeePerGas` and `maxPriorityFeePerGas`
   * * For Legacy transactions, use `gasPrice`
   *
   * @returns {Promise<GasFees>} current fees specified in wei
   */
  //@Example<GasFees>({
  //  gasPrice: '250000000000',
  //  slow: {
  //    maxFeePerGas: '250000000000',
  //    maxPriorityFeePerGas: '10000000000',
  //  },
  //  average: {
  //    maxFeePerGas: '350000000000',
  //    maxPriorityFeePerGas: '150000000000',
  //  },
  //  fast: {
  //    maxFeePerGas: '450000000000',
  //    maxPriorityFeePerGas: '250000000000',
  //  },
  //})
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
   * @example contractAddress "0x495D897BE6a6e57432C954f3C381eaBfa4699795"
   * @example id "5705"
   * @example type "erc721"
   */
  @Example<TokenMetadata>({
    name: 'On-chain Quest',
    description: '',
    media: {
      url: 'https://cdn.galxe.com/galaxy/symbiosis/a9e5b6a0-6e72-4f09-8a96-bd9ca313411f.png',
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
