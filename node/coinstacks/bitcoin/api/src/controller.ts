import { Body, Controller, Example, Get, Path, Post, Query, Response, Route, Tags } from 'tsoa'
import { Address, ApiError as BlockbookApiError, Blockbook, Xpub } from '@shapeshiftoss/blockbook'
import { Cursor } from '@shapeshiftoss/common-api'
import {
  ApiError,
  BadRequestError,
  BaseAPI,
  BaseInfo,
  InternalServerError,
  SendTxBody,
  ValidationError,
} from '../../../common/api/src' // unable to import models from a module with tsoa
import {
  BitcoinAddress,
  BitcoinAPI,
  BitcoinAccount,
  BitcoinTx,
  BitcoinRawTx,
  BTCNetworkFee,
  BTCNetworkFees,
  Utxo,
  BitcoinTxHistory,
} from './models'
import { handleTransaction } from './handlers'

const NETWORK = process.env.NETWORK
const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL

if (!NETWORK) throw new Error('NETWORK env var not set')
if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })

const isXpub = (pubkey: string): boolean => {
  return pubkey.startsWith('xpub') || pubkey.startsWith('ypub') || pubkey.startsWith('zpub')
}

const handleError = (err: unknown): ApiError => {
  if (err instanceof BlockbookApiError) {
    return new ApiError(err.response?.statusText ?? 'Internal Server Error', err.response?.status ?? 500, err.message)
  }

  if (err instanceof Error) {
    return new ApiError('Internal Server Error', 500, err.message)
  }

  return new ApiError('Internal Server Error', 500, 'unknown error')
}

@Route('api/v1')
@Tags('v1')
export class Bitcoin extends Controller implements BaseAPI, BitcoinAPI {
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
   * Get account details by address or xpub
   *
   * Examples
   * 1. Bitcoin (address)
   * 2. Bitcoin (xpub)
   *
   * @param {string} pubkey account address or xpub
   *
   * @returns {Promise<BitcoinAccount>} account details
   *
   * @example pubkey "336xGpGweq1wtY4kRTuA4w6d7yDkBU9czU"
   * @example pubkey "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz"
   */
  @Example<BitcoinAccount>({
    pubkey: '336xGpGweq1wtY4kRTuA4w6d7yDkBU9czU',
    balance: '974652',
    unconfirmedBalance: '0',
  })
  @Example<BitcoinAccount>({
    pubkey:
      'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz',
    balance: '12688908',
    unconfirmedBalance: '0',
    addresses: [{ pubkey: '1EfgV2Hr5CDjXPavHDpDMjmU33BA2veHy6', balance: '10665' }],
    nextReceiveAddressIndex: 0,
    nextChangeAddressIndex: 0,
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}')
  async getAccount(@Path() pubkey: string): Promise<BitcoinAccount> {
    try {
      let data: Address | Xpub
      if (isXpub(pubkey)) {
        data = await blockbook.getXpub(pubkey, undefined, undefined, undefined, undefined, 'tokenBalances', 'derived')
      } else {
        data = await blockbook.getAddress(pubkey, undefined, undefined, undefined, undefined, 'basic')
      }

      // list of all used addresses with additional derived addresses up to gap limit of 20, including any detected balances
      const addresses = data.tokens?.map<BitcoinAddress>((token) => ({
        balance: token.balance ?? '0',
        pubkey: token.name,
      }))

      // For any change indexes detected by blockbook, we want to find the next unused address.
      // To do this we will add 1 to any address indexes found and keep track of the highest index.
      const nextAddressIndexes = (data.tokens ?? []).reduce<Array<number>>((prev, token) => {
        if (!token.path || token.transfers === 0) return prev

        const [, , , , change, addressIndex] = token.path.split('/')
        const changeIndex = Number(change)
        const nextAddressIndex = Number(addressIndex) + 1

        if (!prev[changeIndex] || nextAddressIndex > prev[changeIndex]) {
          prev[changeIndex] = nextAddressIndex
        }

        return prev
      }, [])

      return {
        pubkey: data.address,
        balance: data.balance,
        unconfirmedBalance: data.unconfirmedBalance,
        addresses,
        nextReceiveAddressIndex: nextAddressIndexes[0] ?? 0,
        nextChangeAddressIndex: nextAddressIndexes[1] ?? 0,
      }
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Get transaction history by address or xpub
   *
   * @param {string} pubkey account address or xpub
   * @param {string} [cursor] the cursor returned in previous query (base64 encoded json object with a 'page' property)
   * @param {number} [pageSize] page size (10 by default)
   *
   * @returns {Promise<TxHistory>} transaction history
   *
   * @example pubkey "336xGpGweq1wtY4kRTuA4w6d7yDkBU9czU"
   * @example pubkey "xpub6DQYbVJSVvJPzpYenir7zVSf2WPZRu69LxZuMezzAKuT6biPcug6Vw1zMk4knPBeNKvioutc4EGpPQ8cZiWtjcXYvJ6wPiwcGmCkihA9Jy3"
   */
  @Example<BitcoinTxHistory>({
    pubkey: '336xGpGweq1wtY4kRTuA4w6d7yDkBU9czU',
    cursor: 'eyJwYWdlIjoyfQ==',
    txs: [
      {
        txid: '77810bfcb0bf66216391838772b790dde1b7419ae57f3b266c718ea937989155',
        blockHash: '00000000000000000008b5901008aa05d05330fa54abc01a73587c0a1b1291f2',
        blockHeight: 645850,
        timestamp: 1598700231,
        confirmations: 81971,
        value: '510611',
        fee: '224',
        hex: '020000000158c53ac5b9e1b56b571c9530dc214af7be2efae45974a337d24e555d77d57b16010000006a47304402200e13f2e48612bfe1b8d69f59dfcfc288f3f896a248aac7d70b1dcc2e860e2f70022057487d594e247d6980b330e767c9e2b3e99dc975481999bb0307b5dc96c3923b012102174a52f766c3c174adbcaf1677818e04879cb8f27153d7a44775b050e11a44e0feffffff02090300000000000017a9140f7f0fc4f882ea62f32b06f0946f12b055ab91bf878ac70700000000001976a9148c1ef82c52a7e80621c838008b2de791be3a307988ac98d80900',
        vin: [
          {
            txid: '167bd5775d554ed237a37459e4fa2ebef74a21dc30951c576bb5e1b9c53ac558',
            vout: '1',
            sequence: 4294967294,
            scriptSig: {
              hex: '47304402200e13f2e48612bfe1b8d69f59dfcfc288f3f896a248aac7d70b1dcc2e860e2f70022057487d594e247d6980b330e767c9e2b3e99dc975481999bb0307b5dc96c3923b012102174a52f766c3c174adbcaf1677818e04879cb8f27153d7a44775b050e11a44e0',
            },
            addresses: ['1Dmthegfep7fXVqWAPmQ5rMmKcg58GjEF1'],
          },
        ],
        vout: [
          {
            value: '777',
            n: 0,
            scriptPubKey: {
              hex: 'a9140f7f0fc4f882ea62f32b06f0946f12b055ab91bf87',
            },
            addresses: ['336xGpGweq1wtY4kRTuA4w6d7yDkBU9czU'],
          },
          {
            value: '509834',
            n: 1,
            scriptPubKey: {
              hex: '76a9148c1ef82c52a7e80621c838008b2de791be3a307988ac',
            },
            addresses: ['1Dmthegfep7fXVqWAPmQ5rMmKcg58GjEF1'],
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
    @Query() pageSize = 10
  ): Promise<BitcoinTxHistory> {
    if (pageSize <= 0) throw new ApiError('Bad Request', 422, 'page size must be greater than 0')

    try {
      const curCursor = ((): Cursor => {
        try {
          if (!cursor) return { page: 1 }

          return JSON.parse(Buffer.from(cursor, 'base64').toString('binary'))
        } catch (err) {
          const e: BadRequestError = { error: `invalid base64 cursor: ${cursor}` }
          throw new ApiError('Bad Request', 422, JSON.stringify(e))
        }
      })()

      let data: Address | Xpub
      if (isXpub(pubkey)) {
        data = await blockbook.getXpub(pubkey, curCursor.page, pageSize, undefined, undefined, 'txs')
      } else {
        data = await blockbook.getAddress(pubkey, curCursor.page, pageSize, undefined, undefined, 'txs')
      }

      curCursor.page++

      let nextCursor: string | undefined
      if (curCursor.page <= (data.totalPages ?? 0)) {
        nextCursor = Buffer.from(JSON.stringify(curCursor), 'binary').toString('base64')
      }

      return {
        pubkey: pubkey,
        cursor: nextCursor,
        txs: data.transactions?.map(handleTransaction) ?? [],
      }
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Get all unspent transaction outputs for an address or xpub
   *
   * Examples
   * 1. Bitcoin (address)
   * 2. Bitcoin (xpub)
   *
   * @param {string} pubkey account address or xpub
   *
   * @example pubkey "14mMwtZCGiAtyr8KnnAZYyHmZ9Zvj71h4t"
   * @example pubkey "xpub6CDvS4rkJBfqEyBdTo7omDxv3BwDr5XmWeKsU9HAaLSG28GztaywbAsm6SBWPyEsZ6QDubVnXtNEfDZ74RkDVeLUSkjdZDbsLZCqNWqy7wQ"
   */
  @Example<Array<Utxo>>([
    {
      txid: '02cdb69a97d1b8585797ac31a1954804b40a71c380a3ede0793f21a2cdfd300a',
      vout: 1,
      value: '729',
      height: 601428,
      confirmations: 101330,
    },
  ])
  @Example<Array<Utxo>>([
    {
      txid: 'feab0ffe497740fcc8bcab9c5b12872c4302e629ee8ccc35ed4f6057fc7a4580',
      vout: 1,
      value: '90118',
      height: 702033,
      confirmations: 723,
      address: '1BEyYmi9Vmv3UV6AN76RAfWpzXY23p7ikS',
      path: "m/44'/0'/0'/1/2",
    },
  ])
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}/utxos')
  async getUtxos(@Path() pubkey: string): Promise<Array<Utxo>> {
    try {
      const data = await blockbook.getUtxo(pubkey)
      return data
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Get transaction details
   *
   * @param {string} txid transaction hash
   *
   * @example txid "feab0ffe497740fcc8bcab9c5b12872c4302e629ee8ccc35ed4f6057fc7a4580"
   *
   * @returns {Promise<BitcoinTx>} transaction payload
   */
  @Example<BitcoinTx>({
    txid: 'feab0ffe497740fcc8bcab9c5b12872c4302e629ee8ccc35ed4f6057fc7a4580',
    blockHash: '0000000000000000000a468a69aedb50269f1dd48048bfa94c175465d5de2548',
    blockHeight: 702033,
    timestamp: 1632513682,
    confirmations: 35181,
    value: '92118',
    fee: '22600',
    hex: '0100000001564168f9a4d90084ef419bc249588894f0263a51cb01da363cbf1bd7bfa8e9e5010000006a473044022058b1ed5ed5aceeb078c684a146794ec56e3e043f5341774e684003a4c0c4a9f602204424e9fa2fc99051d55685f19746849120bdce9e19608a3f0503373823804eb9012102eeda6fd963f4a0a0044637ff4c8ba9275e056d745782b44736f04623ff3eca35ffffffff02d0070000000000001976a9149c9d21f47382762df3ad81391ee0964b28dd951788ac06600100000000001976a9147055de79bc47a9f91e4c488170da7666e900731288ac00000000',
    vin: [
      {
        txid: 'e5e9a8bfd71bbf3c36da01cb513a26f094885849c29b41ef8400d9a4f9684156',
        vout: '1',
        sequence: 4294967295,
        scriptSig: {
          hex: '473044022058b1ed5ed5aceeb078c684a146794ec56e3e043f5341774e684003a4c0c4a9f602204424e9fa2fc99051d55685f19746849120bdce9e19608a3f0503373823804eb9012102eeda6fd963f4a0a0044637ff4c8ba9275e056d745782b44736f04623ff3eca35',
        },
        addresses: ['1DJ3RrzKtDu8HRcxXuRBa4HqZfXGAY1R3B'],
        value: '114718',
      },
    ],
    vout: [
      {
        value: '2000',
        n: 0,
        scriptPubKey: {
          hex: '76a9149c9d21f47382762df3ad81391ee0964b28dd951788ac',
        },
        addresses: ['1FH6ehAd5ZFXCM1cLGzHxK1s4dGdq1JusM'],
      },
      {
        value: '90118',
        n: 1,
        scriptPubKey: {
          hex: '76a9147055de79bc47a9f91e4c488170da7666e900731288ac',
        },
        addresses: ['1BEyYmi9Vmv3UV6AN76RAfWpzXY23p7ikS'],
      },
    ],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('tx/{txid}')
  async getTransaction(@Path() txid: string): Promise<BitcoinTx> {
    try {
      const data = await blockbook.getTransaction(txid)
      return handleTransaction(data)
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Get raw transaction details directly from the node
   *
   * @param {string} txid transaction hash
   *
   * @example txid "feab0ffe497740fcc8bcab9c5b12872c4302e629ee8ccc35ed4f6057fc7a4580"
   *
   * @returns {Promise<BitcoinRawTx>} transaction payload
   */
  @Example<BitcoinRawTx>({
    txid: 'feab0ffe497740fcc8bcab9c5b12872c4302e629ee8ccc35ed4f6057fc7a4580',
    hash: 'feab0ffe497740fcc8bcab9c5b12872c4302e629ee8ccc35ed4f6057fc7a4580',
    version: 1,
    size: 225,
    vsize: 225,
    weight: 900,
    locktime: 0,
    vin: [
      {
        txid: 'e5e9a8bfd71bbf3c36da01cb513a26f094885849c29b41ef8400d9a4f9684156',
        vout: 1,
        scriptSig: {
          asm: '3044022058b1ed5ed5aceeb078c684a146794ec56e3e043f5341774e684003a4c0c4a9f602204424e9fa2fc99051d55685f19746849120bdce9e19608a3f0503373823804eb9[ALL] 02eeda6fd963f4a0a0044637ff4c8ba9275e056d745782b44736f04623ff3eca35',
          hex: '473044022058b1ed5ed5aceeb078c684a146794ec56e3e043f5341774e684003a4c0c4a9f602204424e9fa2fc99051d55685f19746849120bdce9e19608a3f0503373823804eb9012102eeda6fd963f4a0a0044637ff4c8ba9275e056d745782b44736f04623ff3eca35',
        },
        sequence: 4294967295,
      },
    ],
    vout: [
      {
        value: '0.00002',
        n: 0,
        scriptPubKey: {
          asm: 'OP_DUP OP_HASH160 9c9d21f47382762df3ad81391ee0964b28dd9517 OP_EQUALVERIFY OP_CHECKSIG',
          hex: '76a9149c9d21f47382762df3ad81391ee0964b28dd951788ac',
          reqSigs: 1,
          type: 'pubkeyhash',
          addresses: ['1FH6ehAd5ZFXCM1cLGzHxK1s4dGdq1JusM'],
        },
      },
    ],
    hex: '0100000001564168f9a4d90084ef419bc249588894f0263a51cb01da363cbf1bd7bfa8e9e5010000006a473044022058b1ed5ed5aceeb078c684a146794ec56e3e043f5341774e684003a4c0c4a9f602204424e9fa2fc99051d55685f19746849120bdce9e19608a3f0503373823804eb9012102eeda6fd963f4a0a0044637ff4c8ba9275e056d745782b44736f04623ff3eca35ffffffff02d0070000000000001976a9149c9d21f47382762df3ad81391ee0964b28dd951788ac06600100000000001976a9147055de79bc47a9f91e4c488170da7666e900731288ac00000000',
    blockhash: '0000000000000000000a468a69aedb50269f1dd48048bfa94c175465d5de2548',
    confirmations: 498,
    time: 1632513682,
    blocktime: 1632513682,
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('tx/{txid}/raw')
  async getRawTransaction(@Path() txid: string): Promise<BitcoinRawTx> {
    try {
      const data = await blockbook.getTransactionSpecific(txid)
      return data as BitcoinRawTx
    } catch (err) {
      throw handleError(err)
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
      throw handleError(err)
    }
  }

  /**
   * Gets current network fee estimates for 'fast', 'average', and 'slow' tx confirmation times
   *
   * @returns {Promise<BTCNetworkFees>}
   */
  @Example<BTCNetworkFees>({
    fast: { blocksUntilConfirmation: 2, satsPerKiloByte: 14231 },
    average: { blocksUntilConfirmation: 5, satsPerKiloByte: 9574 },
    slow: { blocksUntilConfirmation: 10, satsPerKiloByte: 3045 },
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/fees')
  async getNetworkFees(): Promise<BTCNetworkFees> {
    try {
      const blockTimes = { fast: 2, average: 5, slow: 10 }
      const result = await blockbook.estimateFees(Object.values(blockTimes))
      return Object.entries(blockTimes).reduce<BTCNetworkFees>((prev, [key, val], index) => {
        const networkFee: BTCNetworkFee = {
          blocksUntilConfirmation: val,
          satsPerKiloByte: Number(result[index].feePerUnit),
        }
        return { ...prev, [key]: networkFee }
      }, {})
    } catch (err) {
      throw handleError(err)
    }
  }
}
