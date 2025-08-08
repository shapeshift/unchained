import { Blockbook } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'
import { BigNumber } from 'bignumber.js'
import { Body, Example, Get, Post, Response, Route, Tags } from 'tsoa'
import {
  createPublicClient,
  getAddress,
  getContract,
  http,
  isHex,
  parseUnits,
  PublicClient,
  serializeTransaction,
  toHex,
} from 'viem'
import { base } from 'viem/chains'
import { BaseAPI, EstimateGasBody, InternalServerError, ValidationError } from '../../../common/api/src' // unable to import models from a module with tsoa
import { API, GAS_PRICE_ORACLE_ABI } from '../../../common/api/src/evm' // unable to import models from a module with tsoa
import { EVM } from '../../../common/api/src/evm/controller'
import { Service } from '../../../common/api/src/evm/service'
import { GasOracle } from '../../../common/api/src/evm/gasOracle'
import { BaseGasEstimate, BaseGasFees } from './models'

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
  namespace: ['unchained', 'coinstacks', 'base', 'api'],
  level: process.env.LOG_LEVEL,
})

const httpURL = `${INDEXER_URL}/api=${INDEXER_API_KEY}`
const wsURL = `${INDEXER_WS_URL}/api=${INDEXER_API_KEY}`
const rpcUrl = `${RPC_URL}/api=${RPC_API_KEY}`

const client = createPublicClient({ chain: base, transport: http(rpcUrl) }) as PublicClient

export const blockbook = new Blockbook({ httpURL, wsURL, logger })
export const gasOracle = new GasOracle({ logger, client, coinstack: 'base' })

export const service = new Service({
  blockbook,
  gasOracle,
  explorerApiUrl: new URL(`https://api.etherscan.io/v2/api?chainid=8453&apikey=${ETHERSCAN_API_KEY}`),
  client,
  logger,
  rpcUrl,
})

// assign service to be used for all instances of EVM
EVM.service = service

// gas price oracle contract to query current l1 and l2 values
const gpo = getContract({ address: base.contracts.gasPriceOracle.address, abi: GAS_PRICE_ORACLE_ABI, client: client })

@Route('api/v1')
@Tags('v1')
export class Base extends EVM implements BaseAPI, API {
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
  @Example<BaseGasEstimate>({ gasLimit: '21000', l1GasLimit: '1664' })
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('/gas/estimate')
  async estimateGas(@Body() body: EstimateGasBody): Promise<BaseGasEstimate> {
    const { data, from, to, value } = body

    // l2 gas limit
    const { gasLimit } = await service.estimateGas(body)

    // l1 gas limit
    const unsignedTxHash = serializeTransaction({
      data: isHex(data) ? data : toHex(data),
      to: getAddress(to),
      value: parseUnits(value, 0),
      gasLimit: gasLimit,
      chainId: base.id,
      nonce: await client.getTransactionCount({ address: getAddress(from) }),
      type: 'legacy',
    })

    const l1GasLimit = (await gpo.read.getL1GasUsed([unsignedTxHash])).toString()

    return { gasLimit, l1GasLimit }
  }

  /**
   * Get the current recommended gas fees to use in a transaction
   *
   * @returns {Promise<BaseGasFees>} current fees specified in wei
   */
  @Example<BaseGasFees>({
    l1GasPrice: '5349789102',
    baseFeePerGas: '51497198',
    slow: {
      gasPrice: '51815704',
      maxFeePerGas: '51947082',
      maxPriorityFeePerGas: '428650',
    },
    average: {
      gasPrice: '53149928',
      maxFeePerGas: '52728076',
      maxPriorityFeePerGas: '1209644',
    },
    fast: {
      gasPrice: '105353129',
      maxFeePerGas: '145357641',
      maxPriorityFeePerGas: '93839209',
    },
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/fees')
  async getGasFees(): Promise<BaseGasFees> {
    const gasFees = await service.getGasFees()
    const isEcotone = await gpo.read.isEcotone()

    // ecotone l1GasPrice = ((l1BaseFee * baseFeeScalar * 16) + (blobBaseFee * baseFeeScalar)) / (16 * 10^decimals)
    if (isEcotone) {
      const [l1BaseFee, baseFeeScalar, blobBaseFee, blobBaseFeeScalar, decimals] = (
        await Promise.all([
          gpo.read.l1BaseFee(),
          gpo.read.baseFeeScalar(),
          gpo.read.blobBaseFeeScalar(),
          gpo.read.blobBaseFeeScalar(),
          gpo.read.decimals(),
        ])
      ).map((value) => BigNumber(value.toString()))

      const scaledBaseFee = l1BaseFee.times(baseFeeScalar).times(16)
      const scaledBlobBaseFee = blobBaseFee.times(blobBaseFeeScalar)

      const l1GasPrice = BigNumber(scaledBaseFee.plus(scaledBlobBaseFee).toString()).div(
        BigNumber(16).times(BigNumber(10).exponentiatedBy(decimals.toString()))
      )

      return { l1GasPrice: l1GasPrice.toFixed(), ...gasFees }
    }

    // legacy l1GasPrice = l1BaseFee * scalar
    const [l1BaseFee, scalar] = (await Promise.all([gpo.read.l1BaseFee(), gpo.read.scalar()])).map((value) =>
      BigNumber(value.toString())
    )

    const l1GasPrice = l1BaseFee.times(scalar)

    return { l1GasPrice: l1GasPrice.toFixed(), ...gasFees }
  }
}
