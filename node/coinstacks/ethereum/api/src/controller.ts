import { ethers } from 'ethers'
import { Body, Controller, Example, Get, Path, Post, Query, Response, Route, Tags } from 'tsoa'
import { TransactionRequest } from '@ethersproject/abstract-provider'
import { Blockbook } from '@shapeshiftoss/blockbook'
import {
  ApiError,
  BadRequestError,
  BaseAPI,
  Info,
  InternalServerError,
  SendTxBody,
  ValidationError,
} from '../../../common/api/src' // unable to import models from a module with tsoa
import { EthereumAccount, EthereumAPI, EthereumTx, EthereumTxHistory, GasFees, TokenBalance } from './models'
import { logger } from './logger'
import {
  getBlockbookTxs,
  getEtherscanInternalTxs,
  handleTransaction,
  handleTransactionWithInternalEtherscan,
} from './handlers'
import { Cursor } from './types'

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

      const tokens = (data.tokens ?? []).reduce<Array<TokenBalance>>((prev, token) => {
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
   * @param {string} [cursor] the cursor returned in previous query (base64 encoded json object with a 'page' property)
   * @param {number} [pageSize] page size (10 by default)
   *
   * @returns {Promise<TxHistory>} transaction history
   *
   * @example pubkey "0xB3DD70991aF983Cf82d95c46C24979ee98348ffa"
   */
  @Example<EthereumTxHistory>({
    pubkey: '0xB3DD70991aF983Cf82d95c46C24979ee98348ffa',
    cursor:
      'eyJibG9ja2Jvb2tQYWdlIjoxLCJldGhlcnNjYW5QYWdlIjoxLCJibG9ja2Jvb2tUeGlkIjoiMHhhZWU0MzJmODUzZmRjMTNhZDlmZjZjYWJlMmEzOTQwM2Q4N2RkZWUxODQyNDk2ODE4ZmNkODg3NDdmNjU2NmY5IiwiYmxvY2tIZWlnaHQiOjEzODUwMjEzfQ==',
    txs: [
      {
        txid: '0x8e3528c933483770a3c8377c2ee7e34f846908653168188fd0d90a20b295d002',
        blockHash: '0x94228c1b7052720846e2d7b9f36de30acf45d9a06ec483bd4433c5c38c8673a8',
        blockHeight: 12267105,
        timestamp: 1618788849,
        status: 1,
        from: '0xB3DD70991aF983Cf82d95c46C24979ee98348ffa',
        to: '0x642F4Bda144C63f6DC47EE0fDfbac0a193e2eDb7',
        confirmations: 2088440,
        value: '737092621690531649',
        fee: '3180000000009000',
        gasLimit: '21000',
        gasUsed: '21000',
        gasPrice: '151428571429',
        inputData: '0x',
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
  ): Promise<EthereumTxHistory> {
    if (pageSize <= 0) throw new ApiError('Bad Request', 422, 'page size must be greater than 0')

    const curCursor = ((): Cursor => {
      try {
        if (!cursor) return { blockbookPage: 1, etherscanPage: 1 }

        return JSON.parse(Buffer.from(cursor, 'base64').toString('binary'))
      } catch (err) {
        const e: BadRequestError = { error: `invalid base64 cursor: ${cursor}` }
        throw new ApiError('Bad Request', 422, JSON.stringify(e))
      }
    })()

    try {
      let { hasMore: hasMoreBlockbookTxs, blockbookTxs } = await getBlockbookTxs(pubkey, pageSize, curCursor)
      let { hasMore: hasMoreInternalTxs, internalTxs } = await getEtherscanInternalTxs(pubkey, pageSize, curCursor)

      if (!blockbookTxs.size && !internalTxs.size) {
        return {
          pubkey: pubkey,
          txs: [],
        }
      }

      const txs: Array<EthereumTx> = []
      for (let i = 0; i < pageSize; i++) {
        if (!blockbookTxs.size && hasMoreBlockbookTxs) {
          curCursor.blockbookPage++
          ;({ hasMore: hasMoreBlockbookTxs, blockbookTxs } = await getBlockbookTxs(pubkey, pageSize, curCursor))
        }

        if (!internalTxs.size && hasMoreInternalTxs) {
          curCursor.etherscanPage++
          ;({ hasMore: hasMoreInternalTxs, internalTxs } = await getEtherscanInternalTxs(pubkey, pageSize, curCursor))
        }

        if (!internalTxs.size && !blockbookTxs.size) break

        const [internalTx] = internalTxs.values()
        const [blockbookTx] = blockbookTxs.values()

        if (blockbookTx?.blockHeight === -1) {
          // process pending txs first, no associated internal txs

          txs.push({ ...blockbookTx })
          curCursor.blockbookTxid = blockbookTx.txid
        } else if (blockbookTx && blockbookTx.blockHeight >= (internalTx?.blockHeight ?? -2)) {
          // process transactions in descending order prioritizing confirmed, include associated internal txs

          txs.push({ ...blockbookTx, internalTxs: internalTxs.get(blockbookTx.txid)?.txs })

          blockbookTxs.delete(blockbookTx.txid)
          curCursor.blockbookTxid = blockbookTx.txid

          // if there was a matching internal tx, delete it and track as last internal txid seen
          if (internalTxs.has(blockbookTx.txid)) {
            internalTxs.delete(blockbookTx.txid)
            curCursor.etherscanTxid = blockbookTx.txid
          }
        } else {
          // attempt to get matching blockbook tx or fetch if not found
          // if fetch fails, treat internal tx as handled and remove from set
          try {
            const blockbookTx =
              blockbookTxs.get(internalTx.txid) ?? handleTransaction(await blockbook.getTransaction(internalTx.txid))

            txs.push({ ...blockbookTx, internalTxs: internalTx.txs })
          } catch (err) {
            logger.warn(err, `failed to get tx: ${internalTx.txid}`)
          }

          internalTxs.delete(internalTx.txid)
          curCursor.etherscanTxid = internalTx.txid

          // if there was a matching blockbook tx, delete it and track as last blockbook txid seen
          if (blockbookTxs.has(internalTx.txid)) {
            blockbookTxs.delete(internalTx.txid)
            curCursor.blockbookTxid = internalTx.txid
          }
        }
      }

      curCursor.blockHeight = txs[txs.length - 1]?.blockHeight

      const nextCursor = (() => {
        if (!hasMoreBlockbookTxs && !hasMoreInternalTxs) return
        return Buffer.from(JSON.stringify(curCursor), 'binary').toString('base64')
      })()

      return {
        pubkey: pubkey,
        cursor: nextCursor,
        txs: txs,
      }
    } catch (err) {
      if (err.response) {
        throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
      }

      throw err
    }
  }

  /**
   * Get transaction details
   *
   * @param {string} txid transaction hash
   *
   * @example txid "0x8825fe8d60e1aa8d990f150bffe1196adcab36d0c4e98bac76c691719103b79d"
   *
   * @returns {Promise<BitcoinTx>} transaction payload
   */
  @Example<EthereumTx>({
    txid: '0x8825fe8d60e1aa8d990f150bffe1196adcab36d0c4e98bac76c691719103b79d',
    blockHash: '0x122f1e1b594b797d96c1777ce9cdb68ddb69d262ac7f2ddc345909aba4ebabd7',
    blockHeight: 14813163,
    timestamp: 1653078780,
    status: 1,
    from: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8',
    to: '0x275C7d416c1DBfafa53A861EEc6F0AD6138ca4dD',
    confirmations: 21,
    value: '49396718157429775',
    fee: '603633477678000',
    gasLimit: '250000',
    gasUsed: '21000',
    gasPrice: '28744451318',
    inputData: '0x',
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('tx/{txid}')
  async getTransaction(@Path() txid: string): Promise<EthereumTx> {
    try {
      const data = await blockbook.getTransaction(txid)
      return handleTransactionWithInternalEtherscan(data)
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
