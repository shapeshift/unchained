import { Blockbook } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'
import { Body, Example, Get, Post, Response, Route, Tags } from 'tsoa'
import { createPublicClient, http } from 'viem'
import { bsc } from 'viem/chains'
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

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'bnbsmartchain', 'api'],
  level: process.env.LOG_LEVEL,
})

const headers = RPC_API_KEY ? { 'api-key': RPC_API_KEY } : undefined

const client = createPublicClient({ chain: bsc, transport: http(RPC_URL, { fetchOptions: { headers } }) })

export const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL, apiKey: INDEXER_API_KEY, logger })
export const gasOracle = new GasOracle({ logger, client, coinstack: 'bnbsmartchain' })

export const service = new Service({
  blockbook,
  gasOracle,
  explorerApiUrl: new URL(`https://api.etherscan.io/v2/api?chainid=56&apikey=${ETHERSCAN_API_KEY}`),
  client,
  logger,
  rpcUrl: RPC_URL,
  rpcApiKey: RPC_API_KEY,
})

// assign service to be used for all instances of EVM
EVM.service = service

@Route('api/v1')
@Tags('v1')
export class BNBSmartChain extends EVM implements BaseAPI, API {
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
   *    "to": "0xC480394241c76F3993ec5D121ce4F198f7844443",
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
   * @returns {Promise<GasFees>} current fees specified in wei
   */
  @Example<GasFees>({
    baseFeePerGas: '0',
    slow: {
      gasPrice: '1800000000',
      maxFeePerGas: '2200000000',
      maxPriorityFeePerGas: '2200000000',
    },
    average: {
      gasPrice: '3039050000',
      maxFeePerGas: '2925000000',
      maxPriorityFeePerGas: '2925000000',
    },
    fast: {
      gasPrice: '5187055981',
      maxFeePerGas: '3524000000',
      maxPriorityFeePerGas: '3524000000',
    },
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/fees')
  async getGasFees(): Promise<GasFees> {
    return service.getGasFees()
  }
}
