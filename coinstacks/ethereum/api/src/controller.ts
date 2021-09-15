import { ethers } from 'ethers'
import { Body, Controller, Example, Get, Path, Post, Query, Response, Route, Tags } from 'tsoa'
import { TransactionRequest } from '@ethersproject/abstract-provider'
import { Blockbook } from '@shapeshiftoss/blockbook'
import {
  ApiError,
  BadRequestError,
  BaseAPI,
  InternalServerError,
  SendTxBody,
  TxHistory,
  ValidationError,
} from '../../../common/api/src' // unable to import models from a module with tsoa
import { EthereumAPI, EthereumBalance, Token } from './models'

const INDEXER_URL = process.env.INDEXER_URL
const MONGO_DBNAME = process.env.MONGO_DBNAME
const MONGO_URL = process.env.MONGO_URL
const NODE_ENV = process.env.NODE_ENV
const RPC_URL = process.env.RPC_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!MONGO_DBNAME) throw new Error('MONGO_DBNAME env var not set')
if (!MONGO_URL) throw new Error('MONGO_URL env var not set')

if (NODE_ENV !== 'test') {
  if (!RPC_URL) throw new Error('RPC_URL env var not set')
}

const blockbook = new Blockbook(INDEXER_URL)
const provider = new ethers.providers.JsonRpcProvider(RPC_URL)

@Route('api/v1')
@Tags('v1')
export class Ethereum extends Controller implements BaseAPI, EthereumAPI {
  /**
   * Get balance of a pubkey
   *
   * @param pubkey account pubkey
   *
   * @returns {Promise<Balance>} account balance
   *
   * @example pubkey "0xB3DD70991aF983Cf82d95c46C24979ee98348ffa"
   */
  @Example<EthereumBalance>({
    pubkey: '0xB3DD70991aF983Cf82d95c46C24979ee98348ffa',
    balance: '284809805024198107',
    tokens: [
      {
        type: 'ERC20',
        name: 'FOX',
        contract: '0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d',
        symbol: 'FOX',
        decimals: 18,
        balance: '1337',
      },
    ],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('balance/{pubkey}')
  async getBalance(@Path() pubkey: string): Promise<EthereumBalance> {
    try {
      const data = await blockbook.getAddress(pubkey, undefined, undefined, undefined, undefined, 'tokenBalances')

      const tokens = (data.tokens ?? []).reduce<Array<Token>>((prev, token) => {
        if (token.balance && token.contract && token.decimals && token.symbol) {
          prev.push({
            balance: token.balance,
            contract: token.contract,
            decimals: token.decimals,
            name: token.name,
            symbol: token.symbol,
            type: token.type,
          })
        }

        return prev
      }, [])

      return {
        pubkey: data.address,
        balance: data.balance,
        tokens,
      }
    } catch (err) {
      throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
    }
  }

  /**
   * Get transaction history of a pubkey
   *
   * @param {string} pubkey account pubkey
   * @param {number} [page] page number
   * @param {number} [pageSize] page size
   * @param {string} [contract] filter by contract address (only supported by coins which support contracts)
   *
   * @returns {Promise<TxHistory>} transaction history
   *
   * @example pubkey "0xB3DD70991aF983Cf82d95c46C24979ee98348ffa"
   */
  @Example<TxHistory>({
    page: 1,
    totalPages: 1,
    txs: 1,
    transactions: [
      {
        txid: '0x85092cf7a2ec34ba4109ef1215b5b486911163b9d3391e3508670229f4d866e7',
        status: 'confirmed',
        from: '0xB3DD70991aF983Cf82d95c46C24979ee98348ffa',
        to: '0x34249a379Af1Fe3b53e143c0f1B5590778ce2cfC',
        blockHash: '0xc962b0662752ac15671512ca612c894051d8b671375de1cd84f12c5e720dc7ef',
        blockHeight: 11427335,
        confirmations: 9,
        timestamp: 1607632210,
        value: '20000000000000000',
        fee: '5250000000000000',
      },
    ],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('txs/{pubkey}')
  async getTxHistory(
    @Path() pubkey: string,
    @Query() page?: number,
    @Query() pageSize = 25,
    @Query() contract?: string
  ): Promise<TxHistory> {
    try {
      const data = await blockbook.getAddress(pubkey, page, pageSize, undefined, undefined, 'txs', contract)

      return {
        page: data.page ?? 1,
        totalPages: data.totalPages ?? 1,
        txs: data.txs,
        transactions:
          data.transactions?.map((tx) => ({
            network: 'ethereum',
            symbol: tx.tokenTransfers?.[0].symbol ?? 'ETH',
            txid: tx.txid,
            status: tx.confirmations > 0 ? 'confirmed' : 'pending',
            from: tx.vin[0].addresses?.[0] ?? 'coinbase',
            to: tx.vout[0].addresses?.[0],
            blockHash: tx.blockHash,
            blockHeight: tx.blockHeight,
            confirmations: tx.confirmations,
            timestamp: tx.blockTime,
            value: tx.tokenTransfers?.[0].value ?? tx.value,
            fee: tx.fees ?? '0',
          })) ?? [],
      }
    } catch (err) {
      throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
    }
  }

  /**
   * Get the estimated gas cost of a transaction
   *
   * @param {string} data input data
   * @param {string} to to address
   * @param {string} value transaction value in ether
   *
   * @returns {Promise<string>} estimated gas cost
   *
   * @example data "0x"
   * @example to "0x642F4Bda144C63f6DC47EE0fDfbac0a193e2eDb7"
   * @example value "0.0123"
   */
  @Example<string>('26540')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/estimate-gas')
  async estimateGas(@Query() data: string, @Query() to: string, @Query() value: string): Promise<string> {
    try {
      const tx: TransactionRequest = {
        data,
        to,
        value: ethers.utils.parseEther(value),
      }
      const estimatedGas = await provider.estimateGas(tx)
      return estimatedGas?.toString()
    } catch (err) {
      throw new ApiError('Internal Server Error', 500, JSON.stringify(err))
    }
  }

  /**
   * Get the current gas price from the node
   *
   * @returns {Promise<string>} current gas price in wei
   */
  @Example<string>('123456789')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas-price')
  async getGasPrice(): Promise<string> {
    try {
      const gasPrice = await provider.getGasPrice()
      return gasPrice.toString()
    } catch (err) {
      throw new ApiError('Internal Server Error', 500, JSON.stringify(err))
    }
  }

  /**
   * Get the current nonce of an address
   *
   * @param address account address
   *
   * @returns {Promise<number>} account nonce
   *
   * @example address "0xB3DD70991aF983Cf82d95c46C24979ee98348ffa"
   */
  @Example<number>(21933)
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('nonce/{address}')
  async getNonce(@Path() address: string): Promise<number> {
    try {
      const { nonce } = await blockbook.getAddress(address, undefined, undefined, undefined, undefined, 'basic')
      return Number(nonce ?? 0)
    } catch (err) {
      throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
    }
  }

  /**
   * Sends raw transaction to be broadcast to the node.
   *
   * @param {SendTxBody} body serialized raw transaction hex
   *
   * @returns {Promise<string>} transaction id
   *
   * @example rawTx {
   *    "hex": "0xf86c0a85046c7cfe0083016dea94d1310c1e038bc12865d3d3997275b3e4737c6302880b503be34d9fe80080269fc7eaaa9c21f59adf8ad43ed66cf5ef9ee1c317bd4d32cd65401e7aaca47cfaa0387d79c65b90be6260d09dcfb780f29dd8133b9b1ceb20b83b7e442b4bfc30cb"
   * }
   */
  @Example<string>('0xb9d4ad5408f53eac8627f9ccd840ba8fb3469d55cd9cc2a11c6e049f1eef4edd')
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('send/')
  async sendTx(@Body() body: SendTxBody): Promise<string> {
    try {
      const { result } = await blockbook.sendTransaction(body.hex)
      return result
    } catch (err) {
      throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
    }
  }
}
