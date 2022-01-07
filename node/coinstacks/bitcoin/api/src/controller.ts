import { Body, Controller, Example, Get, Path, Post, Query, Response, Route, Tags } from 'tsoa'
import { Address, Blockbook, Xpub } from '@shapeshiftoss/blockbook'
import {
  ApiError,
  BadRequestError,
  BaseAPI,
  Info,
  InternalServerError,
  SendTxBody,
  Tx,
  TxHistory,
  ValidationError,
} from '../../../common/api/src' // unable to import models from a module with tsoa
import { BitcoinAPI, BitcoinAccount, BitcoinTxSpecific, BTCNetworkFee, BTCNetworkFees, Utxo } from './models'
import { Account } from '@shapeshiftoss/common-api'

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

@Route('api/v1')
@Tags('v1')
export class Bitcoin extends Controller implements BaseAPI, BitcoinAPI {
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
      const addresses = (data.tokens ?? []).map<Account>((token) => ({
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
        addresses,
        nextReceiveAddressIndex: nextAddressIndexes[0] ?? 0,
        nextChangeAddressIndex: nextAddressIndexes[1] ?? 0,
      }
    } catch (err) {
      if (err.response) {
        throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
      }

      throw err
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
      if (err.response) {
        throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
      }

      throw err
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
      if (err.response) {
        throw new ApiError(err.response, err.response.status, JSON.stringify(err.response.data))
      }

      throw err
    }
  }

  /**
   * Get transaction specific data directly from the node
   *
   * @param {string} txid transaction hash
   *
   * @example txid "feab0ffe497740fcc8bcab9c5b12872c4302e629ee8ccc35ed4f6057fc7a4580"
   *
   * @returns {Promise<BitcoinTxSpecific>} transaction payload
   */
  @Example<Array<BitcoinTxSpecific>>([
    {
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
            asm:
              '3044022058b1ed5ed5aceeb078c684a146794ec56e3e043f5341774e684003a4c0c4a9f602204424e9fa2fc99051d55685f19746849120bdce9e19608a3f0503373823804eb9[ALL] 02eeda6fd963f4a0a0044637ff4c8ba9275e056d745782b44736f04623ff3eca35',
            hex:
              '473044022058b1ed5ed5aceeb078c684a146794ec56e3e043f5341774e684003a4c0c4a9f602204424e9fa2fc99051d55685f19746849120bdce9e19608a3f0503373823804eb9012102eeda6fd963f4a0a0044637ff4c8ba9275e056d745782b44736f04623ff3eca35',
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
      hex:
        '0100000001564168f9a4d90084ef419bc249588894f0263a51cb01da363cbf1bd7bfa8e9e5010000006a473044022058b1ed5ed5aceeb078c684a146794ec56e3e043f5341774e684003a4c0c4a9f602204424e9fa2fc99051d55685f19746849120bdce9e19608a3f0503373823804eb9012102eeda6fd963f4a0a0044637ff4c8ba9275e056d745782b44736f04623ff3eca35ffffffff02d0070000000000001976a9149c9d21f47382762df3ad81391ee0964b28dd951788ac06600100000000001976a9147055de79bc47a9f91e4c488170da7666e900731288ac00000000',
      blockhash: '0000000000000000000a468a69aedb50269f1dd48048bfa94c175465d5de2548',
      confirmations: 498,
      time: 1632513682,
      blocktime: 1632513682,
    },
  ])
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('transaction/{txid}')
  async getTransaction(@Path() txid: string): Promise<BitcoinTxSpecific> {
    try {
      const data = await blockbook.getTransactionSpecific(txid)
      return data as BitcoinTxSpecific
    } catch (err) {
      if (err.response) {
        throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
      }

      throw err
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
      if (err.response) {
        throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
      }

      throw err
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
      if (err.response) {
        throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
      }

      throw err
    }
  }
}
