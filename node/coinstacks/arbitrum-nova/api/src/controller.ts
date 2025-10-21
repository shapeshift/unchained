import { Blockbook } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'
import { Body, Example, Get, Post, Response, Route, Tags } from 'tsoa'
import { createPublicClient, http } from 'viem'
import { arbitrumNova } from 'viem/chains'
import { BaseAPI, EstimateGasBody, InternalServerError, ValidationError } from '../../../common/api/src' // unable to import models from a module with tsoa
import { API, GasEstimate, GasFees } from '../../../common/api/src/evm' // unable to import models from a module with tsoa
import { EVM } from '../../../common/api/src/evm/controller'
import { BlockbookService } from '../../../common/api/src/evm/blockbookService'
import { GasOracle } from '../../../common/api/src/evm/gasOracle'

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
  namespace: ['unchained', 'coinstacks', 'arbitrum-nova', 'api'],
  level: process.env.LOG_LEVEL,
})

const client = createPublicClient({ chain: arbitrumNova, transport: http(RPC_URL) })

export const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL, logger })
export const gasOracle = new GasOracle({ logger, client, coinstack: 'arbitrum-nova' })

export const service = new BlockbookService({
  blockbook,
  gasOracle,
  explorerApiUrl: new URL(`https://api.etherscan.io/v2/api?chainid=42170&apikey=${ETHERSCAN_API_KEY}`),
  client,
  logger,
  rpcUrl: RPC_URL,
})

// assign service to be used for all instances of EVM
EVM.service = service

@Route('api/v1')
@Tags('v1')
export class ArbitrumNova extends EVM implements BaseAPI, API {
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
   *    "to": "0x6e249a692314bceb8ac43b296262df1800915bf4",
   *    "value": "1337"
   * }
   */
  @Example<GasEstimate>({ gasLimit: '30641' })
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
    baseFeePerGas: '10000000',
    slow: {
      gasPrice: '1166100000',
      maxFeePerGas: '1167100000',
      maxPriorityFeePerGas: '1157100000',
    },
    average: {
      gasPrice: '1240550000',
      maxFeePerGas: '1241050000',
      maxPriorityFeePerGas: '1231050000',
    },
    fast: {
      gasPrice: '1240550000',
      maxFeePerGas: '1241050000',
      maxPriorityFeePerGas: '1231050000',
    },
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/fees')
  async getGasFees(): Promise<GasFees> {
    return service.getGasFees()
  }
}
