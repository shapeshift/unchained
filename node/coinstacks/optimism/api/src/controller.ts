import { serialize } from '@ethersproject/transactions'
import { ethers, Contract, BigNumber } from 'ethers'
import { Body, Example, Get, Post, Query, Response, Route, Tags } from 'tsoa'
import BN from 'bignumber.js'
import { Blockbook } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'
import { BaseAPI, EstimateGasBody, InternalServerError, ValidationError } from '../../../common/api/src' // unable to import models from a module with tsoa
import { API, GAS_PRICE_ORACLE_ABI } from '../../../common/api/src/evm' // unable to import models from a module with tsoa
import { EVM } from '../../../common/api/src/evm/controller'
import { Service } from '../../../common/api/src/evm/service'
import { GasOracle } from '../../../common/api/src/evm/gasOracle'
import { OptimismGasEstimate, OptimismGasFees } from './models'

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
  namespace: ['unchained', 'coinstacks', 'optimism', 'api'],
  level: process.env.LOG_LEVEL,
})

const CHAIN_ID: Record<string, number> = { mainnet: 10 }
const GAS_PRICE_ORACLE_ADDRESS = '0x420000000000000000000000000000000000000F'

const httpURL = INDEXER_API_KEY && IS_LIQUIFY ? `${INDEXER_URL}/api=${INDEXER_API_KEY}` : INDEXER_URL
const wsURL = INDEXER_API_KEY && IS_LIQUIFY ? `${INDEXER_WS_URL}/api=${INDEXER_API_KEY}` : INDEXER_WS_URL
const rpcUrl = RPC_API_KEY && IS_LIQUIFY ? `${RPC_URL}/api=${RPC_API_KEY}` : RPC_URL

const apiKey = INDEXER_API_KEY && IS_NOWNODES ? INDEXER_API_KEY : undefined
const headers = RPC_API_KEY && IS_NOWNODES ? { 'api-key': RPC_API_KEY } : undefined
const rpcApiKey = RPC_API_KEY && IS_NOWNODES ? RPC_API_KEY : undefined

const blockbook = new Blockbook({ httpURL, wsURL, logger, apiKey })
const provider = new ethers.providers.JsonRpcProvider({ url: rpcUrl, headers })
export const gasOracle = new GasOracle({ logger, provider, coinstack: 'optimism' })

export const service = new Service({
  blockbook,
  gasOracle,
  explorerApiUrl: new URL(`https://api.etherscan.io/v2/api?chainid=10&apikey=${ETHERSCAN_API_KEY}`),
  provider,
  logger,
  rpcUrl,
  rpcApiKey,
})

// assign service to be used for all instances of EVM
EVM.service = service

// gas price oracle contract to query current l1 and l2 values
const gpo = new Contract(GAS_PRICE_ORACLE_ADDRESS, GAS_PRICE_ORACLE_ABI, provider)

@Route('api/v1')
@Tags('v1')
export class Optimism extends EVM implements BaseAPI, API {
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
  @Example<OptimismGasEstimate>({ gasLimit: '21000', l1GasLimit: '1632' })
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/estimate')
  async getEstimateGas(
    @Query() data: string,
    @Query() from: string,
    @Query() to: string,
    @Query() value: string
  ): Promise<OptimismGasEstimate> {
    // l2 gas limit
    const { gasLimit } = await service.estimateGas({ data, from, to, value })

    // l1 gas limit
    const unsignedTxHash = serialize({
      data,
      to,
      value: ethers.utils.parseUnits(value, 'wei'),
      gasLimit: BigNumber.from(gasLimit),
      chainId: CHAIN_ID[NETWORK as string],
      nonce: await provider.getTransactionCount(from),
    })

    const l1GasLimit = ((await gpo.getL1GasUsed(unsignedTxHash)) as BigNumber).toString()

    return { gasLimit, l1GasLimit }
  }

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
   *    "to": "0x15E03a18349cA885482F59935Af48C5fFbAb8DE1",
   *    "value": "1337"
   * }
   */
  @Example<OptimismGasEstimate>({ gasLimit: '21000', l1GasLimit: '1664' })
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('/gas/estimate')
  async estimateGas(@Body() body: EstimateGasBody): Promise<OptimismGasEstimate> {
    const { data, from, to, value } = body

    // l2 gas limit
    const { gasLimit } = await service.estimateGas(body)

    // l1 gas limit
    const unsignedTxHash = serialize({
      data,
      to,
      value: ethers.utils.parseUnits(value, 'wei'),
      gasLimit: BigNumber.from(gasLimit),
      chainId: CHAIN_ID[NETWORK as string],
      nonce: await provider.getTransactionCount(from),
    })

    const l1GasLimit = ((await gpo.getL1GasUsed(unsignedTxHash)) as BigNumber).toString()

    return { gasLimit, l1GasLimit }
  }

  /**
   * Get the current recommended gas fees to use in a transaction
   *
   * @returns {Promise<OptimismGasFees>} current fees specified in wei
   */
  @Example<OptimismGasFees>({
    l1GasPrice: '4819835362',
    baseFeePerGas: '61074678',
    slow: {
      gasPrice: '61121042',
      maxFeePerGas: '62605850',
      maxPriorityFeePerGas: '1537159',
    },
    average: {
      gasPrice: '93857447',
      maxFeePerGas: '151888001',
      maxPriorityFeePerGas: '90819310',
    },
    fast: {
      gasPrice: '211378464',
      maxFeePerGas: '340609987',
      maxPriorityFeePerGas: '279541296',
    },
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/fees')
  async getGasFees(): Promise<OptimismGasFees> {
    const gasFees = await service.getGasFees()
    const isEcotone = await gpo.isEcotone()

    // ecotone l1GasPrice = ((l1BaseFee * baseFeeScalar * 16) + (blobBaseFee * baseFeeScalar)) / (16 * 10^decimals)
    if (isEcotone) {
      const [l1BaseFee, baseFeeScalar, blobBaseFee, blobBaseFeeScalar, decimals] = (
        await Promise.all([
          gpo.l1BaseFee(),
          gpo.baseFeeScalar(),
          gpo.blobBaseFeeScalar(),
          gpo.blobBaseFeeScalar(),
          gpo.decimals(),
        ])
      ).map((value) => BigNumber.from(value))

      const scaledBaseFee = l1BaseFee.mul(baseFeeScalar).mul(16)
      const scaledBlobBaseFee = blobBaseFee.mul(blobBaseFeeScalar)

      const l1GasPrice = new BN(scaledBaseFee.add(scaledBlobBaseFee).toString()).div(
        new BN(16).times(new BN(10).exponentiatedBy(decimals.toString()))
      )

      return { l1GasPrice: l1GasPrice.toFixed(), ...gasFees }
    }

    // legacy l1GasPrice = l1BaseFee * scalar
    const [l1BaseFee, scalar] = (await Promise.all([gpo.l1BaseFee(), gpo.scalar()])).map((value) =>
      BigNumber.from(value)
    )

    const l1GasPrice = l1BaseFee.mul(scalar)

    return { l1GasPrice: l1GasPrice.toString(), ...gasFees }
  }
}
