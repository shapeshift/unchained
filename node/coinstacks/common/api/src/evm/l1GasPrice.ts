import BigNumber from 'bignumber.js'
import type { GetContractReturnType, PublicClient } from 'viem'
import { AsyncCache, handleError } from '../utils'
import { GAS_PRICE_ORACLE_ABI } from './abi'
import { GAS_FEES_CACHE_TTL } from './moralisService'

export type GasPriceOracle = GetContractReturnType<typeof GAS_PRICE_ORACLE_ABI, PublicClient>

// op stack chains charge an l1 data fee priced from the gas price oracle, cached like the l2 gas fees
export class L1GasPrice {
  private readonly gpo: GasPriceOracle
  private readonly cache: AsyncCache<string>

  // ecotone can't be deactivated, so the oracle is only asked until it reports active
  private isEcotone = false

  constructor(gpo: GasPriceOracle) {
    this.gpo = gpo
    this.cache = new AsyncCache(() => this.fetch(), GAS_FEES_CACHE_TTL)
  }

  get(): Promise<string> {
    return this.cache.get()
  }

  private async fetch(): Promise<string> {
    try {
      this.isEcotone ||= await this.gpo.read.isEcotone()

      // ecotone l1GasPrice = ((l1BaseFee * baseFeeScalar * 16) + (blobBaseFee * blobBaseFeeScalar)) / (16 * 10^decimals)
      if (this.isEcotone) {
        const [l1BaseFee, baseFeeScalar, blobBaseFee, blobBaseFeeScalar, decimals] = (
          await Promise.all([
            this.gpo.read.l1BaseFee(),
            this.gpo.read.baseFeeScalar(),
            this.gpo.read.blobBaseFee(),
            this.gpo.read.blobBaseFeeScalar(),
            this.gpo.read.decimals(),
          ])
        ).map((value) => BigNumber(value.toString()))

        const scaledBaseFee = l1BaseFee.times(baseFeeScalar).times(16)
        const scaledBlobBaseFee = blobBaseFee.times(blobBaseFeeScalar)

        const l1GasPrice = BigNumber(scaledBaseFee.plus(scaledBlobBaseFee).toString()).div(
          BigNumber(16).times(BigNumber(10).exponentiatedBy(decimals.toString()))
        )

        return l1GasPrice.toFixed()
      }

      // legacy l1GasPrice = l1BaseFee * scalar
      const [l1BaseFee, scalar] = (await Promise.all([this.gpo.read.l1BaseFee(), this.gpo.read.scalar()])).map(
        (value) => BigNumber(value.toString())
      )

      return l1BaseFee.times(scalar).toFixed()
    } catch (err) {
      // mapped like other upstream errors, which also keeps the rpc url and its api key out of the logs
      throw handleError(err)
    }
  }
}
