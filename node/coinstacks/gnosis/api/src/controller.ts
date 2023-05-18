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
  namespace: ['unchained', 'coinstacks', 'gnosis', 'api'],
  level: process.env.LOG_LEVEL,
})

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })
const provider = new ethers.providers.JsonRpcProvider(RPC_URL)

export const service = new Service({
  blockbook,
  explorerApiKey: ETHERSCAN_API_KEY,
  explorerApiUrl: 'https://api.gnosisscan.io/api',
  provider,
  logger,
  rpcUrl: RPC_URL,
})

@Route('api/v1')
@Tags('v1')
export class Gnosis extends Controller implements BaseAPI, API {
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
   * @example pubkey "0xBA7A4c521DfCD18fEB7cdA4B7CA182d739B7A6a0"
   */
  @Example<Account>({
    balance: '400000000000000000',
    unconfirmedBalance: '0',
    nonce: 0,
    pubkey: '0xBA7A4c521DfCD18fEB7cdA4B7CA182d739B7A6a0',
    tokens: [
      {
        balance: '1510000000000000000000',
        contract: '0x21a42669643f45Bc0e086b8Fc2ed70c23D67509d',
        decimals: 18,
        name: 'FOX on xDai',
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
   *
   * @returns {Promise<TxHistory>} transaction history
   *
   * @example pubkey "0xBA7A4c521DfCD18fEB7cdA4B7CA182d739B7A6a0"
   */
  @Example<TxHistory>({
    pubkey: '0xBA7A4c521DfCD18fEB7cdA4B7CA182d739B7A6a0',
    cursor:
      'eyJibG9ja2Jvb2tQYWdlIjozLCJleHBsb3JlclBhZ2UiOjEsImJsb2NrYm9va1R4aWQiOiIweGNlZTEwY2ViNzAwZDJmOGI1ODQ2YzVhY2E5NTg5NjY2NGZjYzk2ZDQzYTdiODg2NzRiYjA3MzJjMDI4MGVhNGYiLCJibG9ja0hlaWdodCI6MjYyNDQ2MTJ9',
    txs: [
      {
        txid: '0xee248fabdd59f26d78ae37d311a34ce8a87ebcfc2251a11245647266f3518c2f',
        blockHash: '0x7104073111b319c81ef45d2c76e82ca1a582eb1094fa5a3302b83ca40bf5ae6d',
        blockHeight: 27990203,
        timestamp: 1684334420,
        status: 1,
        from: '0x9045A4d097F03f34f515A3b3e7B2fD889Dd2Abb7',
        to: '0xBA7A4c521DfCD18fEB7cdA4B7CA182d739B7A6a0',
        confirmations: 17368,
        value: '400000000000000000',
        fee: '31500000147000',
        gasLimit: '21000',
        gasUsed: '21000',
        gasPrice: '1500000007',
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
   * @example txid "0xee248fabdd59f26d78ae37d311a34ce8a87ebcfc2251a11245647266f3518c2f"
   *
   * @returns {Promise<Tx>} transaction payload
   */
  @Example<Tx>({
    txid: '0xee248fabdd59f26d78ae37d311a34ce8a87ebcfc2251a11245647266f3518c2f',
    blockHash: '0x7104073111b319c81ef45d2c76e82ca1a582eb1094fa5a3302b83ca40bf5ae6d',
    blockHeight: 27990203,
    timestamp: 1684334420,
    status: 1,
    from: '0x9045A4d097F03f34f515A3b3e7B2fD889Dd2Abb7',
    to: '0xBA7A4c521DfCD18fEB7cdA4B7CA182d739B7A6a0',
    confirmations: 17385,
    value: '400000000000000000',
    fee: '31500000147000',
    gasLimit: '21000',
    gasUsed: '21000',
    gasPrice: '1500000007',
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
   * @example to "0xBA7A4c521DfCD18fEB7cdA4B7CA182d739B7A6a0"
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
  @Example<GasFees>({
    gasPrice: '4330000000',
    maxFeePerGas: '3625293906',
    maxPriorityFeePerGas: '3625293899',
    slow: {
      maxFeePerGas: '3110445001',
      maxPriorityFeePerGas: '3110444994',
    },
    average: {
      maxFeePerGas: '3625293906',
      maxPriorityFeePerGas: '3625293899',
    },
    fast: {
      maxFeePerGas: '5906365719',
      maxPriorityFeePerGas: '5906365712',
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
   * @example contractAddress "0xB7F00edD54533b61a39e6E3B7bE710725DffB9d8"
   * @example id "285605"
   * @example type "erc721"
   */
  @Example<TokenMetadata>({
    name: 'Loyalty Program',
    description: 'Welcome to the zkBridge Loyalty Point Program.',
    media: {
      url: 'https://gateway.pinata.cloud/ipfs/QmVSiYEQaksNSR2vpKazf6vfe69xA2odJWurVEu4r53Cof',
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
