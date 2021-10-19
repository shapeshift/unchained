import axios, { AxiosInstance } from 'axios'
import { Body, Controller, Example, Get, Path, Post, Response, Route, Tags } from 'tsoa'
import {
  ApiError,
  BadRequestError,
  BaseAPI,
  InternalServerError,
  ValidationError,
  TxHistory,
} from '../../../common/api/src' // unable to import models from a module with tsoa
import {
  ThorchainAccount,
  ThorchainTxsResponse,
  BroadcastTxResponse,
  AuthAccountsResponse,
  BankBalancesResponse,
  ThorchainAmount,
  ThorchainTx,
  ThorchainSendTxBody,
} from './models'

// TODO
// - send endpoint type -- unknown?
// - move types to package?
// - generalize types for Cosmos and beyond

const INDEXER_URL = process.env.INDEXER_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')

@Route('api/v1')
@Tags('v1')
export class Thorchain extends Controller implements BaseAPI {
  instance: AxiosInstance

  constructor(url = INDEXER_URL, timeout?: number) {
    super()
    this.instance = axios.create({
      timeout: timeout ?? 10000,
      baseURL: url,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
  }

  /**
   * Get account details by address
   *
   * @param {string} pubkey account address
   *
   * @returns {Promise<Account>} account details
   *
   * @example pubkey "thor1gz5krpemm0ce4kj8jafjvjv04hmhle576x8gms"
   */
  @Example<ThorchainAccount>({
    balance: '9805024',
    account_number: '6456',
    sequence: '22',
    pubkey: 'thor1gz5krpemm0ce4kj8jafjvjv04hmhle576x8gms',
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}')
  async getAccount(@Path() pubkey: string): Promise<ThorchainAccount> {
    try {
      const { data: accounts } = await this.instance.get<AuthAccountsResponse>(`auth/accounts/${pubkey}`)
      const { data: balances } = await this.instance.get<BankBalancesResponse>(`bank/balances/${pubkey}`)
      const runeBalance = balances.result.find((bal: ThorchainAmount) => bal.denom === 'rune')

      return {
        balance: runeBalance?.amount ?? 'undefined',
        account_number: accounts?.result?.value?.account_number ?? 'undefined',
        sequence: accounts?.result?.value?.sequence ?? 'undefined',
        pubkey: pubkey,
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
   * @returns {Promise<ThorchainTxHistory>} transaction history
   *
   * @example pubkey "thor1gz5krpemm0ce4kj8jafjvjv04hmhle576x8gms"
   */
  @Example<TxHistory>({
    page: 1,
    totalPages: 1,
    txs: 1,
    transactions: [
      {
        txid: 'AF1D57FCF2DDA44C193552F783018E9A49AF6D7C04BCEDC2A90BD22432E55370',
        status: 'confirmed',
        from: 'thor1gz5krpemm0ce4kj8jafjvjv04hmhle576x8gms',
        to: 'thor1yjawrz2dmhdyzz439gr5xtefsu6jm6n6h3mdaf',
        blockHash: '0x94228c1b7052720846e2d7b9f36de30acf45d9a06ec483bd4433c5c38c8673a8',
        blockHeight: 1031771,
        confirmations: 1,
        timestamp: 1,
        value: '10000000',
        fee: '0',
      },
    ],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}/txs')
  async getTxHistory(@Path() pubkey: string): Promise<TxHistory> {
    // TODO:
    // - include receives (thornode api)
    // - include swaps (midgard api)
    // - interleave sends, receives and swaps
    // - handle paging

    try {
      const { data: sends } = await this.instance.get<ThorchainTxsResponse>(
        `/txs?message.sender=${pubkey}&page=1&limit=30`
      )

      const transactions = sends.txs.map((transaction: ThorchainTx) => {
        const timestamp = Date.parse(transaction?.timestamp)
        const runeFee = transaction?.tx?.value?.fee?.amount?.find((fee) => fee?.denom === 'rune')

        return {
          txid: transaction.txhash,
          status: 'confirmed',
          from: 'todo',
          to: 'todo',
          blockHash: 'todo',
          blockHeight: Number(transaction.height),
          confirmations: 1,
          timestamp: Number(timestamp / 1000), // convert ms to sec
          value: 'todo',
          fee: runeFee?.amount ?? 'unknown',
        }
      })

      return {
        page: 1,
        totalPages: 1,
        txs: Number(sends.count),
        transactions,
      }
    } catch (err) {
      throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
    }
  }

  /**
   * Sends raw transaction to be broadcast to the node.
   *
   * @returns {Promise<string>} transaction id
   *
   * @example body {
   *    "tx": {
   *      "memo": "",
   *      "fee": {
   *        "amount":[{"amount":"0","denom":"rune"}],
   *        "gas":"650000"
   *      },
   *      "msg":[{
   *        "type": "thorchain/MsgSend",
   *        "value": {
   *          "amount": [{"amount":"12706267","denom":"rune"}],
   *          "from_address": "thor1cdpznmwtpz3qt9t4823rkg5wamhq7df28qu69z",
   *          "to_address": "thor1gz5krpemm0ce4kj8jafjvjv04hmhle576x8gms"
   *        }
   *      }],
   *      "signatures":[{
   *        "signature":"uzZ5dgJVMjOK6BZHslK6cfdB3wD9IrG9wt+BcGQhoiUg2+JpT4IPQoTK0RBUqcQaq67gQ7uvbTa/S9xQmjRzSg==",
   *        "pub_key":{"type":"tendermint/PubKeySecp256k1","value":"ArvUYSkr8N00d1gcsnhRrSaC0B8SOxz+AISWo5I1ZJnJ"}
   *      }]
   *    },
   *    "mode":"sync",
   *    "type":"cosmos-sdk/StdTx"
   * }
   */
  @Example<string>('2878C0264E339D40C5723777F4D3A23C51AB5116FBECB843C39B3DCD9BA5A141')
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('send/')
  async sendTx(@Body() body: ThorchainSendTxBody): Promise<string> {
    try {
      const { data } = await this.instance.post<BroadcastTxResponse>('/txs', body)
      return data.txhash
    } catch (err) {
      throw new ApiError(err.response.statusText, err.response.status, JSON.stringify(err.response.data))
    }
  }
}
