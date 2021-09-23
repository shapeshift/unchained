import { Body, Controller, Example, Get, Path, Post, Query, Response, Route, Tags } from 'tsoa'
import { Address, Blockbook, Xpub } from '@shapeshiftoss/blockbook'
import {
  ApiError,
  BadRequestError,
  Account,
  BaseAPI,
  InternalServerError,
  SendTxBody,
  Tx,
  TxHistory,
  ValidationError,
} from '../../../common/api/src' // unable to import models from a module with tsoa
import { BitcoinAPI, BitcoinAccount, Utxo } from './models'

const INDEXER_URL = process.env.INDEXER_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')

const blockbook = new Blockbook(INDEXER_URL)

const isXpub = (pubkey: string): boolean => {
  return pubkey.startsWith('xpub') || pubkey.startsWith('ypub') || pubkey.startsWith('zpub')
}

@Route('api/v1')
@Tags('v1')
export class Bitcoin extends Controller implements BaseAPI, BitcoinAPI {
  /**
   * Get account details by address or xpub
   *
   * Examples
   * 1. Bitcoin (address)
   * 2. Bitcoin (xpub)
   *
   * @param {string} pubkey account address or xpub
   *
   * @returns {Promise<Account>} account details
   *
   * @example pubkey "336xGpGweq1wtY4kRTuA4w6d7yDkBU9czU"
   * @example pubkey "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz"
   */
  @Example<BitcoinAccount>({
    pubkey: '336xGpGweq1wtY4kRTuA4w6d7yDkBU9czU',
    balance: '974652',
  })
  @Example<BitcoinAccount>({
    pubkey:
      'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz',
    balance: '12688908',
    addresses: [{ pubkey: '1EfgV2Hr5CDjXPavHDpDMjmU33BA2veHy6', balance: '10665' }],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}')
  async getAccount(@Path() pubkey: string): Promise<BitcoinAccount> {
    try {
      let data: Address | Xpub
      if (isXpub(pubkey)) {
        data = await blockbook.getXpub(pubkey, undefined, undefined, undefined, undefined, 'tokenBalances', 'used')
      } else {
        data = await blockbook.getAddress(pubkey, undefined, undefined, undefined, undefined, 'basic')
      }

      const addresses = data.tokens?.reduce<Array<Account>>((prev, token) => {
        if (token.balance) {
          prev.push({ pubkey: token.name, balance: token.balance })
        }

        return prev
      }, [])

      return {
        pubkey: data.address,
        balance: data.balance,
        addresses,
      }
    } catch (err) {
      throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
    }
  }

  /**
   * Get transaction history by address or xpub
   *
   * @param {string} pubkey account address or xpub
   * @param {number} [page] page number
   * @param {number} [pageSize] page size
   * @param {string} [contract] filter by contract address (only supported by coins which support contracts)
   *
   * @returns {Promise<TxHistory>} transaction history
   *
   * @example pubkey "336xGpGweq1wtY4kRTuA4w6d7yDkBU9czU"
   * @example pubkey "xpub6DQYbVJSVvJPzpYenir7zVSf2WPZRu69LxZuMezzAKuT6biPcug6Vw1zMk4knPBeNKvioutc4EGpPQ8cZiWtjcXYvJ6wPiwcGmCkihA9Jy3"
   */
  @Example<TxHistory>({
    page: 1,
    totalPages: 1,
    txs: 1,
    transactions: [
      {
        txid: '77810bfcb0bf66216391838772b790dde1b7419ae57f3b266c718ea937989155',
        status: 'confirmed',
        from: '1Dmthegfep7fXVqWAPmQ5rMmKcg58GjEF1',
        to: '336xGpGweq1wtY4kRTuA4w6d7yDkBU9czU',
        blockHash: '00000000000000000008b5901008aa05d05330fa54abc01a73587c0a1b1291f2',
        blockHeight: 645850,
        confirmations: 54972,
        timestamp: 1598700231,
        value: '510611',
        fee: '224',
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
      let data: Address | Xpub
      if (isXpub(pubkey)) {
        data = await blockbook.getXpub(pubkey, page, pageSize, undefined, undefined, 'txs')
      } else {
        data = await blockbook.getAddress(pubkey, page, pageSize, undefined, undefined, 'txs', contract)
      }

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
   * Get all unspent transaction outputs for an address or xpub
   *
   * @param {string} pubkey account address or xpub
   *
   * @example pubkey "14mMwtZCGiAtyr8KnnAZYyHmZ9Zvj71h4t"
   * @example pubkey "xpub6DQYbVJSVvJPzpYenir7zVSf2WPZRu69LxZuMezzAKuT6biPcug6Vw1zMk4knPBeNKvioutc4EGpPQ8cZiWtjcXYvJ6wPiwcGmCkihA9Jy3"
   */
  @Example<Array<Utxo>>([
    {
      address: '14mMwtZCGiAtyr8KnnAZYyHmZ9Zvj71h4t',
      confirmations: 58362,
      txid: '02cdb69a97d1b8585797ac31a1954804b40a71c380a3ede0793f21a2cdfd300a',
      value: '729',
      vout: 1,
    },
  ])
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}/utxos')
  async getUtxos(@Path() pubkey: string): Promise<Array<Utxo>> {
    try {
      const data = await blockbook.getUtxo(pubkey, true)

      const utxos = data.map<Utxo>((utxo) => ({
        address: utxo.address ?? pubkey,
        confirmations: utxo.confirmations,
        txid: utxo.txid,
        value: utxo.value,
        vout: utxo.vout,
      }))

      return utxos
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
