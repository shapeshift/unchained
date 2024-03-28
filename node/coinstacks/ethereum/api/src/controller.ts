import { ethers } from 'ethers'
import { Example, Get, Query, Response, Route, Tags } from 'tsoa'
import { Blockbook } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'
import { BaseAPI, InternalServerError, ValidationError } from '../../../common/api/src' // unable to import models from a module with tsoa
import { API, GasEstimate, GasFees } from '../../../common/api/src/evm' // unable to import models from a module with tsoa
import { EVM } from '../../../common/api/src/evm/controller'
import { Service } from '../../../common/api/src/evm/service'
import { GasOracle } from '../../../common/api/src/evm/gasOracle'

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY
const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const INDEXER_API_KEY = process.env.INDEXER_API_KEY
const NETWORK = process.env.NETWORK
const RPC_URL = process.env.RPC_URL
const RPC_API_KEY = process.env.RPC_API_KEY

if (!ETHERSCAN_API_KEY) throw new Error('ETHERSCAN_API_KEY env var not set')
if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!NETWORK) throw new Error('NETWORK env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'ethereum', 'api'],
  level: process.env.LOG_LEVEL,
})

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL, apiKey: INDEXER_API_KEY, logger })
const headers = RPC_API_KEY ? { 'api-key': RPC_API_KEY } : undefined
const provider = new ethers.providers.JsonRpcProvider({ url: RPC_URL, headers })
export const gasOracle = new GasOracle({ logger, provider, coinstack: 'ethereum' })

export const service = new Service({
  blockbook,
  gasOracle,
  explorerApiKey: ETHERSCAN_API_KEY,
  explorerApiUrl: 'https://api.etherscan.io/api',
  provider,
  logger,
  rpcUrl: RPC_URL,
  rpcApiKey: RPC_API_KEY,
})

// assign service to be used for all instances of EVM
EVM.service = service

@Route('api/v1')
@Tags('v1')
export class Ethereum extends EVM implements BaseAPI, API {
  /**
   * Get the estimated gas cost of a transaction
   *
   * @param {string} data input data
   * @param {string} from from address
   * @param {string} to to address
   * @param {string} value transaction value in wei
   *
   * @returns {Promise<GasEstimate>} estimated gas cost
   *
   * @example data "0x"
   * @example from "0x0000000000000000000000000000000000000000"
   * @example to "0x0000000000000000000000000000000000000000"
   * @example value "1337"
   */
  @Example<GasEstimate>({ gasLimit: '26540' })
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/estimate')
  async estimateGas(
    @Query() data: string,
    @Query() from: string,
    @Query() to: string,
    @Query() value: string
  ): Promise<GasEstimate> {
    return service.estimateGas(data, from, to, value)
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
    gasPrice: '77125288868',
    baseFeePerGas: '77654025212',
    maxPriorityFeePerGas: '94000001',
    slow: {
      gasPrice: '77109280451',
      maxFeePerGas: '77744243213',
      maxPriorityFeePerGas: '90218001',
    },
    average: {
      gasPrice: '78637140239',
      maxFeePerGas: '79158075213',
      maxPriorityFeePerGas: '1504050001',
    },
    fast: {
      gasPrice: '85079071846',
      maxFeePerGas: '89883761218',
      maxPriorityFeePerGas: '12229736006',
    },
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/fees')
  async getGasFees(): Promise<GasFees> {
    return service.getGasFees()
  }
}
