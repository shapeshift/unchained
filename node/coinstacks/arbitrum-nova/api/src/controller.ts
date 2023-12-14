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
  namespace: ['unchained', 'coinstacks', 'arbitrum-nova', 'api'],
  level: process.env.LOG_LEVEL,
})

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL, logger })
const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
export const gasOracle = new GasOracle({ logger, provider, coinstack: 'arbitrum-nova' })

export const service = new Service({
  blockbook,
  gasOracle,
  explorerApiUrl: 'https://api-nova.arbiscan.io/api',
  provider,
  logger,
  rpcUrl: RPC_URL,
})

@Route('api/v1')
@Tags('v1')
export class ArbitrumNova extends Controller implements BaseAPI, API {
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
   * @example pubkey "0x6e249a692314bceb8ac43b296262df1800915bf4"
   */
  @Example<Account>({
    balance: '3947543807646782',
    unconfirmedBalance: '0',
    nonce: 2,
    pubkey: '0x6E249A692314bcEB8ac43B296262Df1800915Bf4',
    tokens: [
      {
        balance: '14131423',
        contract: '0x750ba8b76187092B0D1E87E28daaf484d1b5273b',
        decimals: 6,
        name: 'USD Coin',
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
   * @param {number} [from] from block number (0 by default)
   * @param {number} [to] to block number (pending by default)
   *
   * @returns {Promise<TxHistory>} transaction history
   *
   * @example pubkey "0x6e249a692314bceb8ac43b296262df1800915bf4"
   */
  @Example<TxHistory>({
    pubkey: '0x6e249a692314bceb8ac43b296262df1800915bf4',
    txs: [
      {
        txid: '0x375cb328fe3399f67ac315ee4a00d92b0b60d12c98830d7600aec0f55e4163c6',
        blockHash: '0x3ee0749ef10654a2bc87e7d949d18d344f26320184e4c0f0f4c3932877d9affa',
        blockHeight: 26670056,
        timestamp: 1698434321,
        status: 1,
        from: '0xe93685f3bBA03016F02bD1828BaDD6195988D950',
        to: '0xA658742d33ebd2ce2F0bdFf73515Aa797Fd161D9',
        confirmations: 2744,
        value: '11000000000000000',
        fee: '1868700000000',
        gasLimit: '1193952',
        gasUsed: '155725',
        gasPrice: '12000000',
        inputData:
          '0x0508941e00000000000000000000000000000000000000000000000000000000000000a5000000000000000000000000b6789dacf323d60f650628dc1da344d502bc41e30000000000000000000000000000000000000000000000000000000000030d407ae3e7b0abe71c59d59ffdff318609711ef20011e4eab53d342e4f0093cb0d9b7ae3e7b0abe71c59d59ffdff318609711ef20011e4eab53d342e4f0093cb0d9b00000000000000000000000000000000000000000000000000000000000000e00000000000000000000000006e249a692314bceb8ac43b296262df1800915bf40000000000000000000000000000000000000000000000000000000000000068000000000000000000000000042b8289c97896529ec2fe49ba1a8b9c956a86cc0000000000009f8500a55673b6e6e51de3479b8deb22df46b12308db5e1e00afb6789dacf323d60f650628dc1da344d502bc41e36e249a692314bceb8ac43b296262df1800915bf4000000000000000000000000000000000000000000000000',
        internalTxs: [
          {
            from: '0xA658742d33ebd2ce2F0bdFf73515Aa797Fd161D9',
            to: '0x6E249A692314bcEB8ac43B296262Df1800915Bf4',
            value: '11000000000000000',
          },
        ],
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
   * @example txid "0x375cb328fe3399f67ac315ee4a00d92b0b60d12c98830d7600aec0f55e4163c6"
   *
   * @returns {Promise<Tx>} transaction payload
   */
  @Example<Tx>({
    txid: '0x375cb328fe3399f67ac315ee4a00d92b0b60d12c98830d7600aec0f55e4163c6',
    blockHash: '0x3ee0749ef10654a2bc87e7d949d18d344f26320184e4c0f0f4c3932877d9affa',
    blockHeight: 26670056,
    timestamp: 1698434321,
    status: 1,
    from: '0xe93685f3bBA03016F02bD1828BaDD6195988D950',
    to: '0xA658742d33ebd2ce2F0bdFf73515Aa797Fd161D9',
    confirmations: 2937,
    value: '11000000000000000',
    fee: '1868700000000',
    gasLimit: '1193952',
    gasUsed: '155725',
    gasPrice: '12000000',
    inputData:
      '0x0508941e00000000000000000000000000000000000000000000000000000000000000a5000000000000000000000000b6789dacf323d60f650628dc1da344d502bc41e30000000000000000000000000000000000000000000000000000000000030d407ae3e7b0abe71c59d59ffdff318609711ef20011e4eab53d342e4f0093cb0d9b7ae3e7b0abe71c59d59ffdff318609711ef20011e4eab53d342e4f0093cb0d9b00000000000000000000000000000000000000000000000000000000000000e00000000000000000000000006e249a692314bceb8ac43b296262df1800915bf40000000000000000000000000000000000000000000000000000000000000068000000000000000000000000042b8289c97896529ec2fe49ba1a8b9c956a86cc0000000000009f8500a55673b6e6e51de3479b8deb22df46b12308db5e1e00afb6789dacf323d60f650628dc1da344d502bc41e36e249a692314bceb8ac43b296262df1800915bf4000000000000000000000000000000000000000000000000',
    internalTxs: [
      {
        from: '0xA658742d33ebd2ce2F0bdFf73515Aa797Fd161D9',
        to: '0x6E249A692314bcEB8ac43B296262Df1800915Bf4',
        value: '11000000000000000',
      },
    ],
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
   * @example to "0x6e249a692314bceb8ac43b296262df1800915bf4"
   * @example value "1337"
   */
  @Example<GasEstimate>({ gasLimit: '30641' })
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
    gasPrice: '10000000',
    baseFeePerGas: '10000000',
    maxPriorityFeePerGas: '0',
    slow: {
      gasPrice: '1166100000',
      maxFeePerGas: '1167100000',
      maxPriorityFeePerGas: '1157100000',
    },
    average: {
      gasPrice: '1240550000',
      maxFeePerGas: '1241050000',
      maxPriorityFeePerGas: '1231050000',
    },
    fast: {
      gasPrice: '1240550000',
      maxFeePerGas: '1241050000',
      maxPriorityFeePerGas: '1231050000',
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
   * @example contractAddress "0x6f81e9D51Bf482EC3f3724B28eEFE9f9fBe4Fe04"
   * @example id "9999"
   * @example type "erc721"
   */
  @Example<TokenMetadata>({
    name: 'Mira "Striker" Loyola',
    description: '',
    media: {
      url: 'https://dps-gen1-meta.s3.amazonaws.com/9999.png',
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
