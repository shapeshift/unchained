import { Blockbook } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'
import { Body, Example, Get, Post, Response, Route, Tags } from 'tsoa'
import { createPublicClient, http } from 'viem'
import { avalanche } from 'viem/chains'
import { BaseAPI, EstimateGasBody, InternalServerError, ValidationError } from '../../../common/api/src' // unable to import models from a module with tsoa
import { API, GasEstimate, GasFees } from '../../../common/api/src/evm' // unable to import models from a module with tsoa
import { EVM } from '../../../common/api/src/evm/controller'
import { BlockbookService } from '../../../common/api/src/evm/blockbookService'
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
  namespace: ['unchained', 'coinstacks', 'avalanche', 'api'],
  level: process.env.LOG_LEVEL,
})

const headers = RPC_API_KEY ? { 'api-key': RPC_API_KEY } : undefined

const client = createPublicClient({ chain: avalanche, transport: http(RPC_URL, { fetchOptions: { headers } }) })

export const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL, apiKey: INDEXER_API_KEY, logger })
export const gasOracle = new GasOracle({ logger, client, coinstack: 'avalanche' })

export const service = new BlockbookService({
  blockbook,
  gasOracle,
  explorerApiUrl: new URL(`https://api.etherscan.io/v2/api?chainid=43114&apikey=${ETHERSCAN_API_KEY}`),
  client,
  logger,
  rpcUrl: RPC_URL,
  rpcApiKey: RPC_API_KEY,
})

// assign service to be used for all instances of EVM
EVM.service = service

@Route('api/v1')
@Tags('v1')
export class Avalanche extends EVM implements BaseAPI, API {
  /**
   * Estimate gas cost of a transaction
   *
   * @param {EstimateGasBody} body transaction data to estimate gas cost
   *
   * @returns {Promise<GasEstimate>} estimated gas cost
   *
   * @example body {
   *    "data": "0x",
   *    "from": "0x0000000000000000000000000000000000000000",
   *    "to": "0x9D1170D30944F2E30664Be502aC57F6096fB5366",
   *    "value": "1337"
   * }
   */
  @Example<GasEstimate>({ gasLimit: '21000' })
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('/gas/estimate')
  async estimateGas(@Body() body: EstimateGasBody): Promise<GasEstimate> {
    return service.estimateGas(body)
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
    baseFeePerGas: '25000000000',
    slow: {
      gasPrice: '25757584186',
      maxFeePerGas: '28394352138',
      maxPriorityFeePerGas: '3394352138',
    },
    average: {
      gasPrice: '28228764956',
      maxFeePerGas: '32489417391',
      maxPriorityFeePerGas: '7489417391',
    },
    fast: {
      gasPrice: '38695403370',
      maxFeePerGas: '47086501038',
      maxPriorityFeePerGas: '22086501038',
    },
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/fees')
  async getGasFees(): Promise<GasFees> {
    return service.getGasFees()
  }
}
