import { EvmChain } from '@moralisweb3/common-evm-utils'
import { EvmStreamResult, EvmStreamResultish } from '@moralisweb3/common-streams-utils'
import { Logger } from '@shapeshiftoss/logger'
import express from 'express'
import { Body, Example, Get, Post, Response, Request, Route, Tags, Hidden } from 'tsoa'
import { createPublicClient, http, keccak256, toBytes } from 'viem'
import { gnosis } from 'viem/chains'
import { ApiError, BaseAPI, EstimateGasBody, InternalServerError, ValidationError } from '../../../common/api/src' // unable to import models from a module with tsoa
import { API, GasEstimate, GasFees, MoralisService } from '../../../common/api/src/evm' // unable to import models from a module with tsoa
import { EVM } from '../../../common/api/src/evm/controller'

const MIN_PRIORITY_FEE = '1000000000' // 1 gwei in wei

const INDEXER_URL = process.env.INDEXER_URL
const NETWORK = process.env.NETWORK
const RPC_URL = process.env.RPC_URL
const RPC_API_KEY = process.env.RPC_API_KEY

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!NETWORK) throw new Error('NETWORK env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')
if (!RPC_API_KEY) throw new Error('RPC_API_KEY env var not set')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'gnosis', 'api'],
  level: process.env.LOG_LEVEL,
})

const rpcUrl = `${RPC_URL}/${RPC_API_KEY}`

const client = createPublicClient({ chain: gnosis, transport: http(rpcUrl) })

export const service = new MoralisService({
  chain: EvmChain.GNOSIS,
  logger,
  client,
  rpcUrl,
  minPriorityFee: MIN_PRIORITY_FEE,
})

// assign service to be used for all instances of EVM
EVM.service = service

@Route('api/v1')
@Tags('v1')
export class Gnosis extends EVM implements BaseAPI, API {
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
   *    "to": "0xBA7A4c521DfCD18fEB7cdA4B7CA182d739B7A6a0",
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
    baseFeePerGas: '7',
    slow: {
      gasPrice: '1967447305',
      maxFeePerGas: '1554947308',
      maxPriorityFeePerGas: '1554947301',
    },
    average: {
      gasPrice: '2545383854',
      maxFeePerGas: '2055458056',
      maxPriorityFeePerGas: '2055458049',
    },
    fast: {
      gasPrice: '2927445852',
      maxFeePerGas: '2245520056',
      maxPriorityFeePerGas: '2245520049',
    },
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/fees')
  async getGasFees(): Promise<GasFees> {
    return service.getGasFees()
  }

  @Hidden()
  @Post('/webhook/moralis')
  async handleMoralisStream(@Body() body: unknown, @Request() req: express.Request) {
    if (!service.transactionHandler) return

    const signature = req.headers['x-signature']
    if (!signature || typeof signature !== 'string') throw new ApiError('Bad Request', 422, 'Invalid signature')

    const secret = await service.getSecret()
    const generatedSignature = keccak256(toBytes(JSON.stringify(body) + secret))

    if (signature !== generatedSignature) {
      throw new ApiError('Unauthorized', 401, 'Signature is not valid')
    }

    const data = body as EvmStreamResultish

    logger.debug({ data }, 'handleMoralisStream')

    // confirmed === false: transaction has just confirmed in the latest block
    // confirmed === true: transaction has is still confirmed after N block confirmations
    if (data.confirmed === true) return

    const txs = await service.handleStreamResultWithInternalTrace(EvmStreamResult.create(data))

    for (const tx of txs) {
      await service.transactionHandler(tx)
    }
  }
}
