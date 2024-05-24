import { serialize } from '@ethersproject/transactions'
import { ethers, Contract, BigNumber } from 'ethers'
import { Example, Get, Query, Response, Route, Tags } from 'tsoa'
import BN from 'bignumber.js'
import { Blockbook } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'
import { BaseAPI, InternalServerError, ValidationError } from '../../../common/api/src' // unable to import models from a module with tsoa
import { API, GAS_PRICE_ORACLE_ABI } from '../../../common/api/src/evm' // unable to import models from a module with tsoa
import { EVM } from '../../../common/api/src/evm/controller'
import { Service } from '../../../common/api/src/evm/service'
import { GasOracle } from '../../../common/api/src/evm/gasOracle'
import { BaseGasEstimate, BaseGasFees } from './models'

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
  namespace: ['unchained', 'coinstacks', 'base', 'api'],
  level: process.env.LOG_LEVEL,
})

const CHAIN_ID: Record<string, number> = { mainnet: 8453 }
const GAS_PRICE_ORACLE_ADDRESS = '0x420000000000000000000000000000000000000F'

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL, logger })
const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
export const gasOracle = new GasOracle({ logger, provider, coinstack: 'base' })

export const service = new Service({
  blockbook,
  gasOracle,
  explorerApiKey: ETHERSCAN_API_KEY,
  explorerApiUrl: 'https://api.basescan.org/api',
  provider,
  logger,
  rpcUrl: RPC_URL,
})

// assign service to be used for all instances of EVM
EVM.service = service

// gas price oracle contract to query current l1 and l2 values
const gpo = new Contract(GAS_PRICE_ORACLE_ADDRESS, GAS_PRICE_ORACLE_ABI, provider)

@Route('api/v1')
@Tags('v1')
export class Base extends EVM implements BaseAPI, API {
  /**
   * Get the estimated gas cost of a transaction
   *
   * @param {string} data input data
   * @param {string} from from address
   * @param {string} to to address
   * @param {string} value transaction value in wei
   *
   * @returns {Promise<BaseGasEstimate>} estimated gas cost
   *
   * @example data "0x"
   * @example from "0x0000000000000000000000000000000000000000"
   * @example to "0x15E03a18349cA885482F59935Af48C5fFbAb8DE1"
   * @example value "1337"
   */
  @Example<BaseGasEstimate>({ gasLimit: '21000', l1GasLimit: '1664' })
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/estimate')
  async estimateGas(
    @Query() data: string,
    @Query() from: string,
    @Query() to: string,
    @Query() value: string
  ): Promise<BaseGasEstimate> {
    // l2 gas limit
    const { gasLimit } = await service.estimateGas(data, from, to, value)

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
   * @returns {Promise<BaseGasFees>} current fees specified in wei
   */
  @Example<BaseGasFees>({
    l1GasPrice: '5349789102',
    gasPrice: '52518432',
    baseFeePerGas: '51497198',
    maxPriorityFeePerGas: '1000000',
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
    const l1BaseFee = (await gpo.l1BaseFee()) as BigNumber
    const isEcotone = await gpo.isEcotone()
    const gasFees = await service.getGasFees()

    if (isEcotone) {
      const baseFeeScalar = BigNumber.from(await gpo.baseFeeScalar())
      const blobBaseFee = BigNumber.from(await gpo.blobBaseFeeScalar())
      const blobBaseFeeScalar = BigNumber.from(await gpo.blobBaseFeeScalar())
      const scaledBaseFee = l1BaseFee.mul(baseFeeScalar).mul(16)
      const scaledBlobBaseFee = blobBaseFee.mul(blobBaseFeeScalar)

      const decimals = BigNumber.from(await gpo.decimals())
      const l1GasPrice = new BN(scaledBaseFee.add(scaledBlobBaseFee).toString()).div(
        new BN(16).times(new BN(10).exponentiatedBy(decimals.toString()))
      )

      return { l1GasPrice: l1GasPrice.toFixed(), ...gasFees }
    }

    return { l1GasPrice: l1BaseFee.toString(), ...gasFees }
  }
}
