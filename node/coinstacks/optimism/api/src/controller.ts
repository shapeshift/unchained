import { serialize } from '@ethersproject/transactions'
import { ethers, Contract, BigNumber } from 'ethers'
import { Example, Get, Query, Response, Route, Tags } from 'tsoa'
import { Blockbook } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'
import { predeploys, getContractInterface } from '@eth-optimism/contracts-bedrock'
import { BaseAPI, InternalServerError, ValidationError } from '../../../common/api/src' // unable to import models from a module with tsoa
import { API } from '../../../common/api/src/evm' // unable to import models from a module with tsoa
import { EVM } from '../../../common/api/src/evm/controller'
import { Service } from '../../../common/api/src/evm/service'
import { GasOracle } from '../../../common/api/src/evm/gasOracle'
import { OptimismGasEstimate, OptimismGasFees } from './models'

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
  namespace: ['unchained', 'coinstacks', 'optimism', 'api'],
  level: process.env.LOG_LEVEL,
})

const CHAIN_ID: Record<string, number> = { mainnet: 10 }

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL, logger })
const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
export const gasOracle = new GasOracle({ logger, provider, coinstack: 'optimism' })

export const service = new Service({
  blockbook,
  gasOracle,
  explorerApiKey: ETHERSCAN_API_KEY,
  explorerApiUrl: 'https://api-optimistic.etherscan.io/api',
  provider,
  logger,
  rpcUrl: RPC_URL,
})

// assign service to be used for all instances of EVM
EVM.service = service

// gas price oracle contract to query current l1 and l2 values
const gpo = new Contract(predeploys.GasPriceOracle, getContractInterface('GasPriceOracle'), provider)

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
  @Example<OptimismGasEstimate>({ gasLimit: '21000', l1GasLimit: '3800' })
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/estimate')
  async estimateGas(
    @Query() data: string,
    @Query() from: string,
    @Query() to: string,
    @Query() value: string
  ): Promise<OptimismGasEstimate> {
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
   * * `l1GasPrice` = l1BaseFee * scalar
   *
   * @returns {Promise<OptimismGasFees>} current fees specified in wei
   */
  @Example<OptimismGasFees>({
    l1GasPrice: '68076217338',
    gasPrice: '1048154',
    slow: {
      gasPrice: '1082857',
    },
    average: {
      gasPrice: '1082857',
    },
    fast: {
      gasPrice: '1082857',
    },
  })
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/gas/fees')
  async getGasFees(): Promise<OptimismGasFees> {
    const l1GasPrice = (await gpo.l1BaseFee()) as BigNumber
    const gasFees = await service.getGasFees()
    return { l1GasPrice: l1GasPrice.toString(), ...gasFees }
  }
}
