import { EvmChain } from '@moralisweb3/common-evm-utils'
import { EvmStreamResult, EvmStreamResultish } from '@moralisweb3/common-streams-utils'
import { ApiError, handleError } from '@shapeshiftoss/common-api'
import { Logger } from '@shapeshiftoss/logger'
import express from 'express'
import { Body, Example, Get, Hidden, Post, Response, Request, Route, Tags, Path } from 'tsoa'
import { createPublicClient, http, keccak256, toBytes } from 'viem'
import { arbitrum } from 'viem/chains'
import { BaseAPI, EstimateGasBody, InternalServerError, ValidationError } from '../../../common/api/src' // unable to import models from a module with tsoa
import { API, GasEstimate, GasFees, MoralisService } from '../../../common/api/src/evm' // unable to import models from a module with tsoa
import { EVM } from '../../../common/api/src/evm/controller'
import { EventCache, StakingDuration } from './rfox'

const INDEXER_URL = process.env.INDEXER_URL
const RPC_URL = process.env.RPC_URL
const RPC_API_KEY = process.env.RPC_API_KEY
const INFURA_API_KEY = 'a6eddff9714e4aebbf30b6a6b93e4ece'

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')
if (!RPC_API_KEY) throw new Error('RPC_API_KEY env var not set')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'arbitrum', 'api'],
  level: process.env.LOG_LEVEL,
})

const rpcUrl = `${RPC_URL}/${RPC_API_KEY}`

const client = createPublicClient({ chain: arbitrum, transport: http(rpcUrl) })

export const service = new MoralisService({ chain: EvmChain.ARBITRUM, logger, client, rpcUrl })

export const cache = new EventCache(
  createPublicClient({ chain: arbitrum, transport: http(`https://arbitrum-mainnet.infura.io/v3/${INFURA_API_KEY}`) })
)

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

  /**
   * Get rFOX staking duration by contract address
   *
   * @param {string} address account address
   *
   * @returns {Promise<StakingDuration>} staking duration in seconds by staking contract address
   */
  @Example<StakingDuration>({
    '0xaC2a4fD70BCD8Bab0662960455c363735f0e2b56': 0,
    '0x83B51B7605d2E277E03A7D6451B1efc0e5253A2F': 0,
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/rfox/staking-duration/{address}')
  async getRfoxStakingDuration(@Path() address: string): Promise<StakingDuration> {
    try {
      return await cache.getStakingDuration(address)
    } catch (err) {
      throw handleError(err)
    }
  }

  @Hidden()
  @Post('/webhook/moralis')
  async handleMoralisStream(@Body() body: unknown, @Request() req: express.Request) {
    if (!(service instanceof MoralisService)) throw new ApiError('Not Found', 404, 'Endpoint not available')

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

    const txs = await service.handleStreamResult(EvmStreamResult.create(data))

    for (const tx of txs) {
      await service.transactionHandler(tx)
    }
  }
}
