import { Blockbook } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'
import { Body, Example, Get, Post, Response, Route, Tags } from 'tsoa'
import { createPublicClient, http } from 'viem'
import { arbitrum } from 'viem/chains'
import { BaseAPI, EstimateGasBody, InternalServerError, ValidationError } from '../../../common/api/src' // unable to import models from a module with tsoa
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

const IS_LIQUIFY = RPC_URL.toLowerCase().includes('liquify') && INDEXER_URL.toLowerCase().includes('liquify')
const IS_NOWNODES = RPC_URL.toLowerCase().includes('nownodes') && INDEXER_URL.toLowerCase().includes('nownodes')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'arbitrum', 'api'],
  level: process.env.LOG_LEVEL,
})

const httpURL = INDEXER_API_KEY && IS_LIQUIFY ? `${INDEXER_URL}/api=${INDEXER_API_KEY}` : INDEXER_URL
const wsURL = INDEXER_API_KEY && IS_LIQUIFY ? `${INDEXER_WS_URL}/api=${INDEXER_API_KEY}` : INDEXER_WS_URL
const rpcUrl = RPC_API_KEY && IS_LIQUIFY ? `${RPC_URL}/api=${RPC_API_KEY}` : RPC_URL

const apiKey = INDEXER_API_KEY && IS_NOWNODES ? INDEXER_API_KEY : undefined
const headers = RPC_API_KEY && IS_NOWNODES ? { 'api-key': RPC_API_KEY } : undefined
const rpcApiKey = RPC_API_KEY && IS_NOWNODES ? RPC_API_KEY : undefined

const client = createPublicClient({ chain: arbitrum, transport: http(rpcUrl, { fetchOptions: { headers } }) })

export const blockbook = new Blockbook({ httpURL, wsURL, logger, apiKey })
export const gasOracle = new GasOracle({ logger, client, coinstack: 'arbitrum' })

export const service = new Service({
  blockbook,
  gasOracle,
  explorerApiUrl: new URL(`https://api.etherscan.io/v2/api?chainid=42161&apikey=${ETHERSCAN_API_KEY}`),
  client,
  logger,
  rpcUrl,
  rpcApiKey,
})

// assign service to be used for all instances of EVM
EVM.service = service

@Route('api/v1')
@Tags('v1')
export class Arbitrum extends EVM implements BaseAPI, API {
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
   *    "to": "0x0000000000000000000000000000000000000000",
   *    "value": "1337"
   * }
   */
  @Example<GasEstimate>({ gasLimit: '374764' })
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
    baseFeePerGas: '100000000',
    slow: {
      gasPrice: '184334277',
      maxFeePerGas: '190000001',
      maxPriorityFeePerGas: '90000001',
    },
    average: {
      gasPrice: '187859277',
      maxFeePerGas: '205000001',
      maxPriorityFeePerGas: '105000001',
    },
    fast: {
      gasPrice: '199001183',
      maxFeePerGas: '290000001',
      maxPriorityFeePerGas: '190000001',
    },
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/fees')
  async getGasFees(): Promise<GasFees> {
    return service.getGasFees()
  }
}
