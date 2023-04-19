import { serialize } from '@ethersproject/transactions'
import { ethers, Contract } from 'ethers'
import { Body, Controller, Example, Get, Path, Post, Query, Response, Route, Tags } from 'tsoa'
import { Blockbook } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'
import { predeploys, getContractInterface } from '@eth-optimism/contracts'

import {
  BadRequestError,
  BaseAPI,
  BaseInfo,
  InternalServerError,
  SendTxBody,
  ValidationError,
} from '../../../common/api/src' // unable to import models from a module with tsoa
import { API, Account, Tx, TxHistory } from '../../../common/api/src/evm' // unable to import models from a module with tsoa
import { Service } from '../../../common/api/src/evm/service'
import { OptimismGasEstimate, OptimismGasFees } from './models'
import BigNumber from 'bignumber.js'

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY
const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const NETWORK = process.env.NETWORK
const RPC_URL = process.env.RPC_URL

if (!ETHERSCAN_API_KEY) throw new Error('ETHERSCAN_API_KEY env var not set')
if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!NETWORK) throw new Error('NETWORK env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'optimism', 'api'],
  level: process.env.LOG_LEVEL,
})

const CHAIN_ID: Record<string, number> = { mainnet: 10 }

const provider = new ethers.providers.JsonRpcProvider(RPC_URL)

export const service = new Service({
  blockbook: new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL }),
  explorerApiKey: ETHERSCAN_API_KEY,
  explorerApiUrl: 'https://api-optimistic.etherscan.io/api',
  provider,
  logger,
  rpcUrl: RPC_URL,
})

// gas price oracle contract to query current l1 and l2 values
const gpo = new Contract(predeploys.OVM_GasPriceOracle, getContractInterface('OVM_GasPriceOracle'), provider)

@Route('api/v1')
@Tags('v1')
export class Optimism extends Controller implements BaseAPI, API {
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
   * Get account details by address
   *
   * @param {string} pubkey account address
   *
   * @returns {Promise<Account>} account details
   *
   * @example pubkey "0x15E03a18349cA885482F59935Af48C5fFbAb8DE1"
   */
  @Example<Account>({
    balance: '1502668290366088',
    unconfirmedBalance: '0',
    nonce: 1,
    pubkey: '0x15E03a18349cA885482F59935Af48C5fFbAb8DE1',
    tokens: [
      {
        balance: '0',
        contract: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
        decimals: 6,
        name: 'USD Coin',
        symbol: 'USDC',
        type: 'ERC20',
      },
    ],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}')
  async getAccount(@Path() pubkey: string): Promise<Account> {
    return service.getAccount(pubkey)
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
   * @example pubkey "0x15E03a18349cA885482F59935Af48C5fFbAb8DE1"
   */
  @Example<TxHistory>({
    pubkey: '0x15E03a18349cA885482F59935Af48C5fFbAb8DE1',
    txs: [
      {
        txid: '0xf4101d7a7fc71410b9ca82dce0b1cce153dea3d4d09bd83bbe510e28033e85db',
        blockHash: '0x980152b8671b1e3e3b0bd5d26f09a584210da32dbad3a586a2fa2bb7c6be926f',
        blockHeight: 60720938,
        timestamp: 1672939590,
        status: 1,
        from: '0x15E03a18349cA885482F59935Af48C5fFbAb8DE1',
        to: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
        confirmations: 1002,
        value: '0',
        fee: '58723200000',
        gasLimit: '150000',
        gasUsed: '36702',
        gasPrice: '1600000',
        inputData:
          '0xa9059cbb000000000000000000000000ebe80f029b1c02862b9e8a70a7e5317c06f62cae000000000000000000000000000000000000000000000000000000000788d3b0',
        tokenTransfers: [
          {
            contract: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
            decimals: 6,
            name: 'USD Coin',
            symbol: 'USDC',
            type: 'ERC20',
            from: '0x15E03a18349cA885482F59935Af48C5fFbAb8DE1',
            to: '0xEbe80f029b1c02862B9E8a70a7e5317C06F62Cae',
            value: '126407600',
          },
        ],
      },
    ],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}/txs')
  async getTxHistory(@Path() pubkey: string, @Query() cursor?: string, @Query() pageSize = 10): Promise<TxHistory> {
    return service.getTxHistory(pubkey, cursor, pageSize)
  }

  /**
   * Get transaction details
   *
   * @param {string} txid transaction hash
   *
   * @example txid "0xf4101d7a7fc71410b9ca82dce0b1cce153dea3d4d09bd83bbe510e28033e85db"
   * @returns {Promise<Tx>} transaction payload
   */
  @Example<Tx>({
    txid: '0xf4101d7a7fc71410b9ca82dce0b1cce153dea3d4d09bd83bbe510e28033e85db',
    blockHash: '0x980152b8671b1e3e3b0bd5d26f09a584210da32dbad3a586a2fa2bb7c6be926f',
    blockHeight: 60720938,
    timestamp: 1672939590,
    status: 1,
    from: '0x15E03a18349cA885482F59935Af48C5fFbAb8DE1',
    to: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
    confirmations: 1303,
    value: '0',
    fee: '58723200000',
    gasLimit: '150000',
    gasUsed: '36702',
    gasPrice: '1600000',
    inputData:
      '0xa9059cbb000000000000000000000000ebe80f029b1c02862b9e8a70a7e5317c06f62cae000000000000000000000000000000000000000000000000000000000788d3b0',
    tokenTransfers: [
      {
        contract: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
        decimals: 6,
        name: 'USD Coin',
        symbol: 'USDC',
        type: 'ERC20',
        from: '0x15E03a18349cA885482F59935Af48C5fFbAb8DE1',
        to: '0xEbe80f029b1c02862B9E8a70a7e5317C06F62Cae',
        value: '126407600',
      },
    ],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('tx/{txid}')
  async getTransaction(@Path() txid: string): Promise<Tx> {
    return service.getTransaction(txid)
  }

  /**
   * Get the estimated gas cost of a transaction
   *
   * @param {string} data input data
   * @param {string} from from address
   * @param {string} to to address
   * @param {string} value transaction value in wei
   *
   * @returns {Promise<OptimismGasEstimate>} estimated gas cost
   *
   * @example data "0x"
   * @example from "0x0000000000000000000000000000000000000000"
   * @example to "0x15E03a18349cA885482F59935Af48C5fFbAb8DE1"
   * @example value "1337"
   */
  @Example<OptimismGasEstimate>({ gasLimit: '21000', l1GasLimit: '3800' })
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/estimate')
  async estimateGas(
    @Query() data: string,
    @Query() from: string,
    @Query() to: string,
    @Query() value: string
  ): Promise<OptimismGasEstimate> {
    // l2 gas limit
    const { gasLimit } = await service.estimateGas(data, from, to, value)

    // l1 gas limit
    const unsignedTxHash = serialize({
      data,
      to,
      value: ethers.utils.parseUnits(value, 'wei'),
      gasLimit: BigInt(gasLimit),
      chainId: CHAIN_ID[NETWORK as string],
      nonce: await provider.getTransactionCount(from),
    })

    const l1GasLimit = ((await gpo.getL1GasUsed(unsignedTxHash)) as bigint).toString()

    return { gasLimit, l1GasLimit }
  }

  /**
   * Get the current recommended gas fees to use in a transaction
   *
   * * `l1GasPrice` = l1BaseFee * scalar
   *
   * @returns {Promise<OptimismGasFees>} current fees specified in wei
   */
  @Example<OptimismGasFees>({
    l1GasPrice: '25000000000',
    gasPrice: '1000000',
    slow: {},
    average: {},
    fast: {},
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/fees')
  async getGasFees(): Promise<OptimismGasFees> {
    const { l1GasPrice } = (await provider.send('rollup_gasPrices', [])) as { l1GasPrice: string }
    const gasFees = await service.getGasFees()
    return { l1GasPrice: new BigNumber(l1GasPrice).toFixed(0), ...gasFees }
  }

  /**
   * Broadcast signed raw transaction
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
    return service.sendTx(body)
  }
}
