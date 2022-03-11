import { ethers } from 'ethers'
import { Body, Controller, Example, Get, Path, Post, Query, Response, Route, Tags } from 'tsoa'
import { TransactionRequest } from '@ethersproject/abstract-provider'
import { Blockbook, Tx as BlockbookTx, TokenTransfer as BlockbookTokenTransfer } from '@shapeshiftoss/blockbook'
import {
  ApiError,
  BadRequestError,
  BaseAPI,
  Info,
  InternalServerError,
  SendTxBody,
  ValidationError,
} from '../../../common/api/src' // unable to import models from a module with tsoa
import { EthereumAPI, EthereumAccount, Token, GasFees, EthereumTxHistory, EthereumTx, TokenTransfer } from './models'

const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const NETWORK = process.env.NETWORK
const RPC_URL = process.env.RPC_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!NETWORK) throw new Error('NETWORK env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })
const provider = new ethers.providers.JsonRpcProvider(RPC_URL)

@Route('api/v1')
@Tags('v1')
export class Ethereum extends Controller implements BaseAPI, EthereumAPI {
  /**
   * Get information about the running coinstack
   *
   * @returns {Promise<Info>} coinstack info
   */
  @Example<Info>({
    network: 'mainnet',
  })
  @Get('info/')
  async getInfo(): Promise<Info> {
    return {
      network: NETWORK as string,
    }
  }

  /**
   * Get account details by address
   *
   * @param {string} pubkey account address
   *
   * @returns {Promise<EthereumAccount>} account details
   *
   * @example pubkey "0xB3DD70991aF983Cf82d95c46C24979ee98348ffa"
   */
  @Example<EthereumAccount>({
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
        unconfirmedBalance: data.unconfirmedBalance,
        nonce: Number(data.nonce ?? 0),
        pubkey: data.address,
        tokens,
      }
    } catch (err) {
      if (err.response) {
        throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
      }

      throw err
    }
  }

  /**
   * Get transaction history by address
   *
   * @param {string} pubkey account address
   * @param {string} [cursor] pagination cursor from previous response or empty string for first page fetch
   * @param {number} [pageSize] page size (default 25)
   *
   * @returns {Promise<TxHistory>} transaction history
   *
   * @example pubkey "0xB3DD70991aF983Cf82d95c46C24979ee98348ffa"
   */
  @Example<EthereumTxHistory>({
    cursor: 'NA==',
    pubkey: '0xB3DD70991aF983Cf82d95c46C24979ee98348ffa',
    txs: [
      {
        txid: '0x32f33d676db1102dff0cc8bbc5cb60b50b345b8bd9b1fd3b36b5bb10ca4dbc1c',
        blockHash: '0xba7812af0c62013e82c858ba6caf76fef7a1f9517987a32d50ad9d953fb8e099',
        blockHeight: 12222600,
        timestamp: 1618195015,
        from: '0xB3DD70991aF983Cf82d95c46C24979ee98348ffa',
        to: '0x12D79c345cAc7B050A5fF0797B5a607e254C73F5',
        confirmations: 2139476,
        value: '924100',
        fee: '2310720000000000',
        gasLimit: '200000',
        gasUsed: '38512',
        gasPrice: '60000000000',
        status: 1,
        inputData:
          '0xa9059cbb0000000000000000000000006ec19ae0c9381443ec81301e9436d4d886e2994b00000000000000000000000000000000000000000000000000000000000e19c4',
        tokenTransfers: [
          {
            balance: '1216066296447',
            contract: '0x12D79c345cAc7B050A5fF0797B5a607e254C73F5',
            decimals: 4,
            name: 'Buytex',
            symbol: 'BUX',
            type: 'ERC20',
            from: '0xB3DD70991aF983Cf82d95c46C24979ee98348ffa',
            to: '0x6EC19ae0C9381443ec81301e9436d4D886E2994b',
            value: '924100',
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
    @Query() pageSize = 25
  ): Promise<EthereumTxHistory> {
    try {
      let page = 1

      if (cursor) {
        page = Number(Buffer.from(cursor, 'base64').toString('binary'))

        // Validate the decoded cursor
        if (!Number.isInteger(page) || page <= 0) {
          throw new ApiError(
            'Validation Error',
            422,
            'Invalid cursor. Cursor must be a base64 encoded integer greater than 0.'
          )
        }
      }

      const data = await blockbook.getAddress(pubkey, page, pageSize, undefined, undefined, 'txs')

      let newCursor

      if (data.transactions?.length === pageSize) {
        const newPage = (data.page ?? 1) + 1
        newCursor = Buffer.from(newPage.toString(), 'binary').toString('base64')
      }

      return {
        cursor: newCursor,
        pubkey,
        txs:
          data.transactions?.map<EthereumTx>((tx: BlockbookTx) => ({
            txid: tx.txid,
            blockHash: tx.blockHash,
            blockHeight: tx.blockHeight,
            timestamp: tx.blockTime,
            from: tx.vin[0].addresses?.[0] ?? 'coinbase',
            to: tx.vout[0].addresses?.[0] ?? '',
            confirmations: tx.confirmations,
            value: tx.tokenTransfers?.[0].value ?? tx.value,
            fee: tx.fees ?? '0',
            gasLimit: tx.ethereumSpecific?.gasLimit.toString() ?? '',
            gasUsed: tx.ethereumSpecific?.gasUsed?.toString(),
            gasPrice: tx.ethereumSpecific?.gasPrice.toString() ?? '',
            status: tx.ethereumSpecific?.status ?? tx.confirmations > 0 ? 1 : 0,
            inputData: tx.ethereumSpecific?.data,
            tokenTransfers:
              tx.tokenTransfers?.map<TokenTransfer>((tt: BlockbookTokenTransfer) => ({
                balance: data.tokens?.find((e) => e.contract === tt.token)?.balance ?? '0',
                contract: tt.token,
                decimals: tt.decimals,
                name: tt.name,
                symbol: tt.symbol,
                type: tt.type,
                from: tt.from,
                to: tt.to,
                value: tt.value,
              })) ?? [],
          })) ?? [],
      }
    } catch (err) {
      if (err.response) {
        throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
      }

      throw err
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
   * @returns {Promise<GasFees>} current fees specified in wei
   */
  @Example<GasFees>({
    gasPrice: '172301756423',
    maxFeePerGas: '342603512846',
    maxPriorityFeePerGas: '1000000000',
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/fees')
  async getGasFees(): Promise<GasFees> {
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
      if (err.response) {
        throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
      }

      throw err
    }
  }
}
