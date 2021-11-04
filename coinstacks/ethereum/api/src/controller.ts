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
  Tx,
  TxHistory,
  ValidationError,
} from '../../../common/api/src' // unable to import models from a module with tsoa
import { EthereumAPI, EthereumAccount, Token, FeeData } from './models'

const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const RPC_URL = process.env.RPC_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })
const provider = new ethers.providers.JsonRpcProvider(RPC_URL)

@Route('api/v1')
@Tags('v1')
export class Ethereum extends Controller implements BaseAPI, EthereumAPI {
  /**
   * Get account details by address
   *
   * @param {string} pubkey account address
   *
   * @returns {Promise<Account>} account details
   *
   * @example pubkey "0xB3DD70991aF983Cf82d95c46C24979ee98348ffa"
   */
  @Example<EthereumAccount>({
    balance: '284809805024198107',
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
  async getAccount(@Path() pubkey: string): Promise<EthereumAccount> {
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
        balance: data.balance,
        nonce: Number(data.nonce ?? 0),
        pubkey: data.address,
        tokens,
      }
    } catch (err) {
      throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
    }
  }

  /**
   * Get transaction history by address
   *
   * @param {string} pubkey account address
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
  @Get('account/{pubkey}/txs')
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
          data.transactions?.map<Tx>((tx) => ({
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
   * @param {string} from from address
   * @param {string} to to address
   * @param {string} value transaction value in wei
   *
   * @returns {Promise<string>} estimated gas cost
   *
   * @example data "0x"
   * @example from "0x0000000000000000000000000000000000000000"
   * @example to "0x642F4Bda144C63f6DC47EE0fDfbac0a193e2eDb7"
   * @example value "123"
   */
  @Example<string>('26540')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/estimate')
  async estimateGas(
    @Query() data: string,
    @Query() from: string,
    @Query() to: string,
    @Query() value: string
  ): Promise<string> {
    try {
      const tx: TransactionRequest = { data, from, to, value: ethers.utils.parseUnits(value, 'wei') }
      const estimatedGas = await provider.estimateGas(tx)
      return estimatedGas?.toString()
    } catch (err) {
      throw new ApiError('Internal Server Error', 500, JSON.stringify(err))
    }
  }

  /**
   * Get the current recommended gas fees to use in a transaction
   *
   * * For EIP-1559 transactions, use `maxFeePerGas` and `maxPriorityFeePerGas`
   * * For Legacy transactions, use `gasPrice`
   *
   * @returns {Promise<FeeData>} current fees specified in wei
   */
  @Example<FeeData>({
    gasPrice: '172301756423',
    maxFeePerGas: '342603512846',
    maxPriorityFeePerGas: '1000000000',
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/fees')
  async getGasFees(): Promise<FeeData> {
    try {
      const feeData = await provider.getFeeData()
      if (!feeData.gasPrice || !feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
        throw { message: 'no fee data returned from node' }
      }

      return {
        gasPrice: feeData.gasPrice.toString(),
        maxFeePerGas: feeData.maxFeePerGas.toString(),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.toString(),
      }
    } catch (err) {
      throw new ApiError('Internal Server Error', 500, JSON.stringify(err))
    }
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
    try {
      const { result } = await blockbook.sendTransaction(body.hex)
      return result
    } catch (err) {
      throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
    }
  }
}
