import { validatePageSize } from '@shapeshiftoss/common-api'
import { VersionedTransaction } from '@solana/web3.js'
import { DAS, EnrichedTransaction, Helius, Interface, Source, TransactionType } from 'helius-sdk'
import { Body, Example, Get, Path, Post, Query, Response, Route, Tags } from 'tsoa'
import {
  BadRequestError,
  BaseAPI,
  BaseInfo,
  InternalServerError,
  RPCRequest,
  RPCResponse,
  SendTxBody,
  ValidationError,
  handleError,
} from '../../../common/api/src' // unable to import models from a module with tsoa
import { Account, API, EstimateFeesBody, PriorityFees, Token, TokenBalance, Tx, TxHistory } from './models'
import { axiosNoRetry, axiosWithRetry, getTransaction } from './utils'
import { NativeBalance } from './types'

const INDEXER_URL = process.env.INDEXER_URL
const NETWORK = process.env.NETWORK
const RPC_URL = process.env.RPC_URL
const RPC_API_KEY = process.env.RPC_API_KEY

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!NETWORK) throw new Error('NETWORK env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')
if (!RPC_API_KEY) throw new Error('RPC_API_KEY env var not set')

const rpcUrl = RPC_API_KEY ? `${RPC_URL}?api-key=${RPC_API_KEY}` : `${RPC_URL}`
const heliusSdk = new Helius(RPC_API_KEY)

const tokens: Record<string, Token> = {}

@Route('api/v1')
@Tags('v1')
export class Solana implements BaseAPI, API {
  static baseFee = '5000'

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
   * Get account details by address or extended public key
   *
   * @param {string} pubkey account address or extended public key
   *
   * @returns {Promise<Account>} account details
   *
   * @example pubkey "2bUNK6eVUmXyxeSDURsWdqi1KK8BYu4egnzyi3xDYc9M"
   */
  @Example<Account>({
    pubkey: '2bUNK6eVUmXyxeSDURsWdqi1KK8BYu4egnzyi3xDYc9M',
    balance: '0',
    unconfirmedBalance: '0',
    tokens: [],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}')
  async getAccount(@Path() pubkey: string): Promise<Account> {
    try {
      let page = 1
      let balance = '0'
      let hasMore = false
      let tokens: Array<TokenBalance> = []

      do {
        const { total, limit, items, nativeBalance } = (await heliusSdk.rpc.getAssetsByOwner({
          ownerAddress: pubkey,
          page: page++,
          displayOptions: { showFungible: true, showNativeBalance: true, showZeroBalance: true },
        })) as DAS.GetAssetResponseList & { nativeBalance: NativeBalance }

        hasMore = total === limit
        balance = BigInt(nativeBalance.lamports).toString()

        tokens = items.reduce<Array<TokenBalance>>((prev, item) => {
          if (!item.content) return prev
          if (item.interface !== Interface.FUNGIBLE_TOKEN) return prev

          prev.push({
            id: item.id,
            name: item.content.metadata.name,
            symbol: item.content.metadata.symbol,
            decimals: item.token_info?.decimals ?? 0,
            balance: item.token_info?.balance ? BigInt(item.token_info.balance).toString() : '0',
            type: item.interface,
          })

          return prev
        }, tokens)
      } while (hasMore)

      return {
        pubkey,
        balance,
        unconfirmedBalance: '0',
        tokens,
      }
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Get transaction history by address
   *
   * @param {string} pubkey account address
   * @param {string} [cursor] the cursor returned in previous query (used as lastSignature)
   * @param {number} [pageSize] page size (10 by default)
   *
   * @returns {Promise<TxHistory>} transaction history
   *
   * @example pubkey "2bUNK6eVUmXyxeSDURsWdqi1KK8BYu4egnzyi3xDYc9M"
   */
  @Example<TxHistory>({
    pubkey: '2bUNK6eVUmXyxeSDURsWdqi1KK8BYu4egnzyi3xDYc9M',
    txs: [
      {
        txid: '5KDSVYdUSSKSgTcq1PJFmo3vMSNeP383Q3xVqWhGX4xExaYtYmcygA7wncwz8gVgZMbhKtg5ZekD9fsF6T5mCMAv',
        blockHeight: 296167290,
        description:
          '2bUNK6eVUmXyxeSDURsWdqi1KK8BYu4egnzyi3xDYc9M transferred 0.132585825 SOL to 97UQvPXbadGSsVaGuJCBLRm3Mkm7A5DVJ2HktRzrnDTB.',
        type: TransactionType.TRANSFER,
        source: Source.SYSTEM_PROGRAM,
        fee: 5000,
        feePayer: '2bUNK6eVUmXyxeSDURsWdqi1KK8BYu4egnzyi3xDYc9M',
        signature: '5KDSVYdUSSKSgTcq1PJFmo3vMSNeP383Q3xVqWhGX4xExaYtYmcygA7wncwz8gVgZMbhKtg5ZekD9fsF6T5mCMAv',
        slot: 296167290,
        timestamp: 1729185925,
        tokenTransfers: [],
        nativeTransfers: [
          {
            fromUserAccount: '2bUNK6eVUmXyxeSDURsWdqi1KK8BYu4egnzyi3xDYc9M',
            toUserAccount: '97UQvPXbadGSsVaGuJCBLRm3Mkm7A5DVJ2HktRzrnDTB',
            amount: 132585825,
          },
        ],
        accountData: [
          {
            account: '2bUNK6eVUmXyxeSDURsWdqi1KK8BYu4egnzyi3xDYc9M',
            nativeBalanceChange: -132590825,
            tokenBalanceChanges: [],
          },
          {
            account: '97UQvPXbadGSsVaGuJCBLRm3Mkm7A5DVJ2HktRzrnDTB',
            nativeBalanceChange: 132585825,
            tokenBalanceChanges: [],
          },
          {
            account: '11111111111111111111111111111111',
            nativeBalanceChange: 0,
            tokenBalanceChanges: [],
          },
        ],
        transactionError: null,
        instructions: [
          {
            accounts: ['2bUNK6eVUmXyxeSDURsWdqi1KK8BYu4egnzyi3xDYc9M', '97UQvPXbadGSsVaGuJCBLRm3Mkm7A5DVJ2HktRzrnDTB'],
            data: '3Bxs4H6fRtDxLiaT',
            programId: '11111111111111111111111111111111',
            innerInstructions: [],
          },
        ],
        events: {
          compressed: null,
          nft: null,
          swap: null,
        },
      },
    ],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}/txs')
  async getTxHistory(@Path() pubkey: string, @Query() cursor?: string, @Query() pageSize = 10): Promise<TxHistory> {
    validatePageSize(pageSize)

    try {
      const { data } = await axiosNoRetry.get<EnrichedTransaction[]>(
        `${INDEXER_URL}/v0/addresses/${pubkey}/transactions/`,
        {
          params: {
            limit: pageSize,
            before: cursor,
          },
        }
      )

      const txs = data.map((tx) => {
        return {
          txid: tx.signature,
          blockHeight: tx.slot,
          ...tx,
          events: {
            compressed: tx.events.compressed ?? null,
            nft: tx.events.nft ?? null,
            swap: tx.events.swap ?? null,
          },
        } as Tx
      })

      const nextCursor = txs.length ? txs[txs.length - 1].signature : undefined

      return { pubkey, cursor: nextCursor, txs: txs }
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Get transaction details
   *
   * @param {string} txid transaction signature
   *
   * @returns {Promise<Tx>} transaction payload
   *
   * @example txid "5KDSVYdUSSKSgTcq1PJFmo3vMSNeP383Q3xVqWhGX4xExaYtYmcygA7wncwz8gVgZMbhKtg5ZekD9fsF6T5mCMAv"
   */
  @Example<Tx>({
    txid: '5KDSVYdUSSKSgTcq1PJFmo3vMSNeP383Q3xVqWhGX4xExaYtYmcygA7wncwz8gVgZMbhKtg5ZekD9fsF6T5mCMAv',
    blockHeight: 296167290,
    description:
      '2bUNK6eVUmXyxeSDURsWdqi1KK8BYu4egnzyi3xDYc9M transferred 0.132585825 SOL to 97UQvPXbadGSsVaGuJCBLRm3Mkm7A5DVJ2HktRzrnDTB.',
    type: TransactionType.TRANSFER,
    source: Source.SYSTEM_PROGRAM,
    fee: 5000,
    feePayer: '2bUNK6eVUmXyxeSDURsWdqi1KK8BYu4egnzyi3xDYc9M',
    signature: '5KDSVYdUSSKSgTcq1PJFmo3vMSNeP383Q3xVqWhGX4xExaYtYmcygA7wncwz8gVgZMbhKtg5ZekD9fsF6T5mCMAv',
    slot: 296167290,
    timestamp: 1729185925,
    tokenTransfers: [],
    nativeTransfers: [
      {
        fromUserAccount: '2bUNK6eVUmXyxeSDURsWdqi1KK8BYu4egnzyi3xDYc9M',
        toUserAccount: '97UQvPXbadGSsVaGuJCBLRm3Mkm7A5DVJ2HktRzrnDTB',
        amount: 132585825,
      },
    ],
    accountData: [
      {
        account: '2bUNK6eVUmXyxeSDURsWdqi1KK8BYu4egnzyi3xDYc9M',
        nativeBalanceChange: -132590825,
        tokenBalanceChanges: [],
      },
      {
        account: '97UQvPXbadGSsVaGuJCBLRm3Mkm7A5DVJ2HktRzrnDTB',
        nativeBalanceChange: 132585825,
        tokenBalanceChanges: [],
      },
      {
        account: '11111111111111111111111111111111',
        nativeBalanceChange: 0,
        tokenBalanceChanges: [],
      },
    ],
    transactionError: null,
    instructions: [
      {
        accounts: ['2bUNK6eVUmXyxeSDURsWdqi1KK8BYu4egnzyi3xDYc9M', '97UQvPXbadGSsVaGuJCBLRm3Mkm7A5DVJ2HktRzrnDTB'],
        data: '3Bxs4H6fRtDxLiaT',
        programId: '11111111111111111111111111111111',
        innerInstructions: [],
      },
    ],
    events: {
      compressed: null,
      nft: null,
      swap: null,
    },
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('tx/{txid}')
  async getTransaction(@Path() txid: string): Promise<Tx> {
    return getTransaction(txid)
  }

  /**
   * Sends raw transaction to be broadcast to the node.
   *
   * @param {SendTxBody} body serialized raw transaction (base64 encoded)
   *
   * @returns {Promise<string>} transaction signature
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('send/')
  async sendTx(@Body() body: SendTxBody): Promise<string> {
    try {
      const txSig = await heliusSdk.connection.sendRawTransaction(Buffer.from(body.hex, 'base64'))

      return txSig
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Get the current recommended priority fees for a transaction to land
   *
   * @returns {Promise<PriorityFees>} current priority fees specified in micro-lamports
   */
  @Example<PriorityFees>({
    baseFee: '5000',
    slow: '0',
    average: '10',
    fast: '400000',
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/fees/priority')
  async getPriorityFees(): Promise<PriorityFees> {
    try {
      const { priorityFeeLevels } = await heliusSdk.rpc.getPriorityFeeEstimate({
        options: { includeAllPriorityFeeLevels: true },
      })

      if (!priorityFeeLevels) throw new Error('failed to get priority fees')

      return {
        baseFee: Solana.baseFee,
        slow: priorityFeeLevels.low.toString(),
        average: priorityFeeLevels.medium.toString(),
        fast: priorityFeeLevels.high.toString(),
      }
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Get the estimated compute unit cost of a transaction
   *
   * @param {EstimateFeesBody} body transaction message (base64 encoded)
   *
   * @returns {Promise<number>} estimated compute unit cost
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('/fees/estimate')
  async estimateFees(@Body() body: EstimateFeesBody): Promise<string> {
    try {
      if (!('serializedTx' in body) || !body.serializedTx) throw new Error('serializedTx required')

      const deserializedTransaction = VersionedTransaction.deserialize(Buffer.from(body.serializedTx, 'base64'))

      const { value } = await heliusSdk.connection.simulateTransaction(deserializedTransaction, {
        replaceRecentBlockhash: true,
      })

      if (!value.unitsConsumed) throw new Error('Failed to get estimated fee')

      return value.unitsConsumed.toString()
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Makes a jsonrpc request to the node.
   *
   * @param {RPCRequest | Array<RPCRequest>} body jsonrpc request or batch requests
   *
   * @returns {Promise<RPCResponse | Array<RPCResponse>>} jsonrpc response or batch responses
   *
   * @example body {
   *    "jsonrpc": "2.0",
   *    "id": "test",
   *    "method": "getBlockHeight",
   *    "params": []
   * }
   */
  @Example<RPCResponse>({
    jsonrpc: '2.0',
    id: 'test',
    result: 274885350,
  })
  @Post('jsonrpc/')
  async doRpcRequest(@Body() body: RPCRequest | Array<RPCRequest>): Promise<RPCResponse | Array<RPCResponse>> {
    try {
      const { data } = await axiosWithRetry.post<RPCResponse>(rpcUrl, body)
      return data
    } catch (err) {
      throw handleError(err)
    }
  }

  /**
   * Get token details
   *
   * @param {string} id token id
   *
   * @returns {Promise<Token>} token details
   *
   * @example id "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
   */
  @Example<Token>({
    id: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    type: 'FungibleToken',
  })
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/token/{id}')
  async getToken(@Path() id: string): Promise<Token> {
    try {
      if (tokens[id]) return tokens[id]

      const asset = await heliusSdk.rpc.getAsset({ id })

      if (asset.content?.metadata === undefined) throw new Error('token metadata undefined')
      if (asset.token_info?.decimals === undefined) throw new Error('token decimals undefined')

      const token: Token = {
        id: asset.id,
        name: asset.content.metadata.name,
        symbol: asset.content.metadata.symbol,
        decimals: asset.token_info.decimals,
        type: asset.interface,
      }

      tokens[id] = token

      return token
    } catch (err) {
      throw handleError(err)
    }
  }
}
