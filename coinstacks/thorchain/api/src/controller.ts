import axios, { AxiosInstance } from 'axios'
import { Body, Controller, Example, Get, Path, Post, Response, Route, Tags } from 'tsoa'
import { ApiError, BadRequestError, BaseAPI, InternalServerError, ValidationError } from '../../../common/api/src' // unable to import models from a module with tsoa
import {
  ThorchainAccount,
  ThorchainTxsResponse,
  ThorchainTxHistory,
  BroadcastTxResponse,
  AuthAccountsResponse,
  BankBalancesResponse,
  ThorchainAmount,
  ThorchainTx,
} from './models'
import { TxHistory } from '../../../common/api/src'

// todo
// - send endpoint type -- unknown?
// - move types to package?  (defer)
// - tx history -- 1st cut
// - multiple asset balances

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
  @Example<ThorchainTxHistory>({
    page: 1,
    totalPages: 1,
    txs: 1,
    transactions: [
      {
        height: '1031610',
        txhash: 'BB4C487DCF37CBCF3E27D4C1DF7427E4C2C32E4CE5DA20631936786C4F368943',
        data: '0A090A076465706F736974',
        raw_log:
          '[{"events":[{"type":"message","attributes":[{"key":"action","value":"deposit"},{"key":"sender","value":"thor1gz5krpemm0ce4kj8jafjvjv04hmhle576x8gms"},{"key":"sender","value":"thor1gz5krpemm0ce4kj8jafjvjv04hmhle576x8gms"}]},{"type":"transfer","attributes":[{"key":"recipient","value":"thor1dheycdevq39qlkxs2a6wuuzyn4aqxhve4qxtxt"},{"key":"sender","value":"thor1gz5krpemm0ce4kj8jafjvjv04hmhle576x8gms"},{"key":"amount","value":"2000000rune"},{"key":"recipient","value":"thor1g98cy3n9mmjrpn0sxmn63lztelera37n8n67c0"},{"key":"sender","value":"thor1gz5krpemm0ce4kj8jafjvjv04hmhle576x8gms"},{"key":"amount","value":"75513875rune"}]}]}]',
        logs: [],
        gas_wanted: '650000',
        gas_used: '429186',
        tx: {
          type: 'cosmos-sdk/StdTx',
          value: {
            msg: [
              {
                type: 'thorchain/MsgDeposit',
                value: {
                  coins: [
                    {
                      asset: 'THOR.RUNE',
                      amount: '75513875',
                    },
                  ],
                  memo: 'SWAP:BCH.BCH:qrcxsgrfvsc6l9nqc6yswykeu8kspnae0czhvpy5tu:1145020',
                  signer: 'thor1gz5krpemm0ce4kj8jafjvjv04hmhle576x8gms',
                },
              },
            ],
            fee: {
              amount: [
                {
                  denom: 'rune',
                  amount: '2000000',
                },
              ],
              gas: '650000',
            },
            signatures: [
              {
                pub_key: {
                  type: 'tendermint/PubKeySecp256k1',
                  value: 'AxRae5QA0jDYulcpufqzdSnVZk0vH0Mk6M7ezkBi3Zec',
                },
                signature: 'xP/cNadff9QAJiOcCRtQVqKNZTJZ78yoZ04ZWS1PRRBwi40RhnCJd2+9JSLkF6E76IM4joY9h6FFfvRymEy1Nw==',
              },
            ],
            memo: '',
            timeout_height: '0',
          },
        },
        timestamp: '2021-06-15T21:16:39Z',
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
      const { data } = await this.instance.get<ThorchainTxsResponse>(`/txs?message.sender=${pubkey}`)

      const transactions = data.txs.map((tx: ThorchainTx) => {
        const timestamp = Date.parse(tx.timestamp)
        return {
          txid: tx.txhash,
          blockHeight: Number(tx.height),
          status: 'confirmed',
          timestamp: Number(timestamp),
          from: 'todo',
          value: 'todo',
          fee: tx?.tx?.value?.fee?.amount[0]?.amount ?? 'unknown', // TODO - parse out rune fee specifically
        }
      })

      return {
        page: Number(data.page_number),
        totalPages: Number(data.page_total),
        txs: Number(data.count),
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
   * @example {
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
  @Example<string>('txid')
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('send/')
  async sendTx(@Body() body: unknown): Promise<string> {
    const { data } = await this.instance.post<BroadcastTxResponse>('/txs/', body)
    return data.txhash
  }
}
