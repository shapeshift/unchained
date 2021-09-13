import { Body, Example, Get, Path, Post, Query, Response, Route, SuccessResponse, Tags } from 'tsoa'
import { Blockbook } from '@shapeshiftoss/blockbook'
import { RegistryService } from '@shapeshiftoss/common-mongo'
import {
  Account,
  ApiError,
  BadRequestError,
  BalanceChange,
  Block,
  CommonAPI,
  InternalServerError,
  Interval,
  intervals,
  RawTx,
  Tx,
  TxHistory,
  TxReceipt,
  ValidationError,
} from '../../../common/api/src' // unable to import models from a module with tsoa
import { RegistryDocument } from '../../../common/mongo/src' // unable to import models from a module with tsoa
import { ethers, BigNumber } from 'ethers'
import { TransactionRequest } from '@ethersproject/abstract-provider'

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
const registry = new RegistryService(MONGO_URL, MONGO_DBNAME)
const jsonRpcProvider = new ethers.providers.JsonRpcProvider(RPC_URL)

@Route('api/v1')
@Tags('v1')
export class Ethereum extends CommonAPI {
  /**
   * Get Account returns the account information of an address or xpub
   *
   * @param pubKey account address or xpub
   *
   * @returns {Promise<Account>} account information
   *
   * @example address "336xGpGweq1wtY4kRTuA4w6d7yDkBU9czU"
   */
  @Example<Account>({
    network: 'bitcoin',
    symbol: 'BTC',
    pubKey: '336xGpGweq1wtY4kRTuA4w6d7yDkBU9czU',
    balance: '284809805024198107',
    unconfirmedBalance: '0',
    unconfirmedTxs: 0,
    txs: 21933,
    tokens: [],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubKey}')
  async getAccount(@Path() pubKey: string): Promise<Account> {
    try {
      const isValidXpub = validateXpub(pubKey)
      let data

      if (isValidXpub) {
        data = await blockbook.getXpub(pubKey, undefined, undefined, undefined, undefined, 'tokenBalances', 'used')
      } else {
        data = await blockbook.getAddress(pubKey)
      }

      const pubKeyData: Account = {
        network: 'bitcoin',
        symbol: 'BTC',
        pubKey: data.address,
        balance: data.balance,
        unconfirmedBalance: data.unconfirmedBalance,
        unconfirmedTxs: data.unconfirmedTxs,
        txs: data.txs,
      }

      if (isValidXpub && data.tokens) {
        let changeIndex: number | null = null
        let receiveIndex: number | null = null
        for (let i = data.tokens.length - 1; i >= 0 && (changeIndex === null || receiveIndex === null); i--) {
          const splitPath = data.tokens[i].path?.split('/') || []
          const [, , , , change, index] = splitPath

          if (change === '0') {
            receiveIndex = Number(index) + 1
          }
          if (change === '1') {
            changeIndex = Number(index) + 1
          }
        }
        pubKeyData['bitcoin'] = {
          utxos: data.usedTokens || 0,
          receiveIndex: receiveIndex || 0,
          changeIndex: changeIndex || 0,
        }
      }

      return pubKeyData
    } catch (err) {
      throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
    }
  }

  /**
   * Get balance history returns the balance history of an address
   *
   * @param {string} address account address
   * @param {Interval} interval range to group by
   * @param {number} [start] start date as unix timestamp
   * @param {number} [end] end date as unix timestamp
   *
   * @returns {Promise<Array<BalanceChange>>} balance change history
   *
   * @example address "1FH6ehAd5ZFXCM1cLGzHxK1s4dGdq1JusM"
   */
  @Example<Array<BalanceChange>>([
    {
      timestamp: 1492041600,
      amount: '0',
    },
    {
      timestamp: 1498694400,
      amount: '-485100000000000',
    },
    {
      timestamp: 1499904000,
      amount: '60012810000000000',
    },
  ])
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('balancehistory/{address}')
  async getBalanceHistory(
    @Path() address: string,
    @Query() interval: Interval,
    @Query() start?: number,
    @Query() end?: number
  ): Promise<Array<BalanceChange>> {
    try {
      const balances = await blockbook.balanceHistory(address, start, end, 'usd', intervals[interval])

      return balances.map((b) => {
        let amount = '0'

        if (b.received !== '0') {
          amount = b.received
        }

        if (b.sent !== '0') {
          amount = `-${b.sent}`
        }

        return {
          timestamp: b.time,
          amount: amount,
        }
      })
    } catch (err) {
      throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
    }
  }

  /**
   * Get block returns data about a block
   *
   * @param {(number|string)} block height or hash
   *
   * @returns {Promise<Block>} block data
   *
   * @example block "0x84065cdb07d71de1e75e108c3f0053a0ac5c0ff5afbbc033063285088ef135f9"
   * @example block "11421116"
   */
  @Example<Block>({
    network: 'bitcoin',
    hash: '0x84065cdb07d71de1e75e108c3f0053a0ac5c0ff5afbbc033063285088ef135f9',
    prevHash: '0xa42ea5229dbceb181f4e55ee4e5babee65993a41afa7605998b3d9d653c003ba',
    nextHash: '0x36176806b62e6682c28dbeef1ff82ed828e2bdbdbafee15153cae20b32263900',
    height: 11421116,
    confirmations: 45,
    timestamp: 1607549087,
    txs: 149,
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('block/{block}')
  async getBlock(@Path() block: number | string): Promise<Block> {
    try {
      const blk = await blockbook.getBlock(String(block))

      return {
        network: 'bitcoin',
        hash: blk.hash,
        prevHash: blk.previousBlockHash,
        nextHash: blk.nextBlockHash,
        height: blk.height,
        confirmations: blk.confirmations,
        timestamp: blk.time,
        txs: blk.txCount,
      }
    } catch (err) {
      throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
    }
  }

  /**
   * Get transaction returns data about a transaction
   *
   * @param {string} txid transaction id
   *
   * @returns {Promise<Tx>} transaction data
   *
   * @example txid "0xe9c1c7789da09af2ccf285fa175c6e37eb1d977e0b7c85e20de08043f9fe949b"
   */
  @Example<Tx>({
    network: 'bitcoin',
    symbol: 'BTC',
    txid: '0xe9c1c7789da09af2ccf285fa175c6e37eb1d977e0b7c85e20de08043f9fe949b',
    status: 'confirmed',
    from: '0x0a7A454141f86B93c76f131b7365B73027b086b7',
    to: '0xB27172C1d140c077ceF004832fcf4858e6AFbC76',
    blockHash: '0x84065cdb07d71de1e75e108c3f0053a0ac5c0ff5afbbc033063285088ef135f9',
    blockHeight: 11421116,
    confirmations: 2,
    timestamp: 1607549087,
    value: '764365700000000000',
    fee: '651000000000000',
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('tx/{txid}')
  async getTx(@Path() txid: string): Promise<Tx> {
    try {
      const tx = await blockbook.getTransaction(txid)

      return {
        network: 'bitcoin',
        symbol: tx.tokenTransfers?.[0].symbol ?? 'BTC',
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
      }
    } catch (err) {
      throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
    }
  }

  /**
   * Get transaction history returns the transaction history of an address
   *
   * @param {string} address account address
   * @param {number} [page] page number
   * @param {number} [pageSize] page number
   * @param {string} [contract] filter by contract address (only supported by coins which support contracts)
   *
   * @returns {Promise<TxHistory>} transaction history
   *
   * @example address "0xB3DD70991aF983Cf82d95c46C24979ee98348ffa"
   */
  @Example<TxHistory>({
    page: 1,
    totalPages: 1,
    txs: 1,
    transactions: [
      {
        network: 'bitcoin',
        symbol: 'BTC',
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
  @Get('txs/{address}')
  async getTxHistory(
    @Path() address: string,
    @Query() page?: number,
    @Query() pageSize = 25,
    @Query() contract?: string
  ): Promise<TxHistory> {
    try {
      const data = await blockbook.getAddress(address, page, pageSize, undefined, undefined, 'txs', contract)

      return {
        page: data.page ?? 1,
        totalPages: data.totalPages ?? 1,
        txs: data.txs,
        transactions:
          data.transactions?.map((tx) => ({
            network: 'bitcoin',
            symbol: tx.tokenTransfers?.[0].symbol ?? 'BTC',
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
   * Get transaction specific estimated gas
   *
   * @param {string} data contract call data
   * @param {string} to to address
   * @param {string} from from address
   * @param {string} value value of the tx
   * @returns {Promise<string>} estimated gas to be used for the transaction
   *
   */
  @Example<string>('26540')
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/estimategas')
  async getEstimatedGas(
    @Query() data: string,
    @Query() to: string,
    @Query() value: string,
    @Query() from: string
  ): Promise<string> {
    try {
      const tx: TransactionRequest = {
        data,
        to,
        from,
        value: BigNumber.from(value).toHexString(),
      }
      const estimatedGas = await jsonRpcProvider.estimateGas(tx)
      return estimatedGas?.toString()
    } catch (err) {
      throw new ApiError('Internal Server Error', 500, JSON.stringify(err))
    }
  }

  /**
   * Get the current gas price from the node.
   *
   * @returns {Promise<string>} current gas price in wei
   *
   */
  @Example<string>('60000000000')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/feeprice')
  async getFeePrice(): Promise<string> {
    try {
      const gasPrice = await jsonRpcProvider.getGasPrice()
      return gasPrice?.toString()
    } catch (err) {
      throw new ApiError('Internal Server Error', 500, JSON.stringify(err))
    }
  }

  /**
   * Register account details for tracking incoming pending transactions and newly confirmed transactions
   *
   * Example 1: Register a pubkey
   *
   * Example 2: Register an address for pubkey
   *
   * Example 3: Register a single address
   *
   * @param {RegistryDocument} document Contains registry info for registering addresses and pubkeys for a client id.
   *
   * @returns {Promise<void>}
   *
   * @example document {
   *   "client_id": "unchained",
   *   "registration": {
   *     "pubkey": "xpub6CWc1jDKjQH5wzSLz3MTeNVihW2B8sh9w9EyERYVB9f9zLpvdqdKtQDNPVhGGTK9EyTzpw35hp5qJtVoDZXDGoB7U3mShTPs2C8ce48JWJp"
   *   }
   * }
   *
   * @example document {
   *   "client_id": "unchained",
   *   "registration": {
   *     "pubkey": "xpub6CWc1jDKjQH5wzSLz3MTeNVihW2B8sh9w9EyERYVB9f9zLpvdqdKtQDNPVhGGTK9EyTzpw35hp5qJtVoDZXDGoB7U3mShTPs2C8ce48JWJp",
   *     "addresses": ["0x3b53e143c0f1B5590778c34249a379Af1Fee2cfC"]
   *   }
   * }
   *
   * @example document {
   *   "client_id": "unchained",
   *   "registration": {
   *     "addresses": ["0xB3DD70991aF983Cf82d95c46C24979ee98348ffa"]
   *   }
   * }
   */
  @SuccessResponse(204, 'Register Successful')
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('register/')
  async register(@Body() document: RegistryDocument): Promise<void> {
    if (!document.registration.addresses?.length && !document.registration.pubkey) {
      throw new ApiError('Bad Request', 400, JSON.stringify({ error: 'No addresses or pubkey provided' }))
    }

    await registry.add(document)
  }

  /**
   * Unregister accounts to stop tracking incoming pending transactions and newly confirmed transactions
   *
   * Example 1: Unregister a pubkey and all associated addresses
   *
   * Example 2: Unregister a single address from an account
   *
   * @param {RegistryDocument} document Contains registry info for unregistering addresses or pubkeys for a client id.
   *
   * @returns {Promise<void>}
   *
   * @example document {
   *   "client_id": "unchained",
   *   "registration": {
   *     "pubkey": "xpub6CWc1jDKjQH5wzSLz3MTeNVihW2B8sh9w9EyERYVB9f9zLpvdqdKtQDNPVhGGTK9EyTzpw35hp5qJtVoDZXDGoB7U3mShTPs2C8ce48JWJp"
   *   }
   * }
   *
   * @example document {
   *   "client_id": "unchained",
   *   "registration": {
   *     "pubkey": "xpub6CWc1jDKjQH5wzSLz3MTeNVihW2B8sh9w9EyERYVB9f9zLpvdqdKtQDNPVhGGTK9EyTzpw35hp5qJtVoDZXDGoB7U3mShTPs2C8ce48JWJp",
   *     "addresses": ["0x3b53e143c0f1B5590778c34249a379Af1Fee2cfC"]
   *   }
   * }
   */
  @SuccessResponse(204, 'Unregister Successful')
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('unregister/')
  async unregister(@Body() document: RegistryDocument): Promise<void> {
    if (!document.registration.addresses?.length) {
      await registry.delete(document)
    } else {
      await registry.remove(document)
    }
  }

  /**
   * Sends raw transaction to be broadcast to the node.
   *
   * @param {RawTx} rawTx serialized raw transaction hex
   *
   * @returns {Promise<TxReceipt>} transaction receipt
   *
   * @example rawTx {
   *    "hex": "0xf86c0a85046c7cfe0083016dea94d1310c1e038bc12865d3d3997275b3e4737c6302880b503be34d9fe80080269fc7eaaa9c21f59adf8ad43ed66cf5ef9ee1c317bd4d32cd65401e7aaca47cfaa0387d79c65b90be6260d09dcfb780f29dd8133b9b1ceb20b83b7e442b4bfc30cb"
   * }
   */
  @Example<TxReceipt>({
    network: 'bitcoin',
    txid: '0xb9d4ad5408f53eac8627f9ccd840ba8fb3469d55cd9cc2a11c6e049f1eef4edd',
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('send/')
  async sendTx(@Body() rawTx: RawTx): Promise<TxReceipt> {
    try {
      const { result } = await blockbook.sendTransaction(rawTx.hex)
      return {
        network: 'bitcoin',
        txid: result,
      }
    } catch (err) {
      throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
    }
  }

  /**
   * Returns the nonce of an address
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
}

const validateXpub = (xpub: string): boolean => {
  return xpub.startsWith('xpub') || xpub.startsWith('ypub') || xpub.startsWith('zpub')
}
