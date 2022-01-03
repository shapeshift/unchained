import { BigNumber } from 'bignumber.js'
import { ethers } from 'ethers'
import ABI from './erc20ABI'
import { DefaultApi, Configuration } from './generated/midgard'
import { ActionType, Precision, Network, ThorchainArgs, TxDetails, Value } from './types'

export * as Thornode from './generated/thornode'

const precision: Precision = {
  BCH: 8,
  BTC: 8,
  LTC: 8,
  DOGE: 8,
  DASH: 8,
  DGB: 8,
  ETH: 18,
  BNB: 8,
  THOR: 8,
}

const isNetworkSupported = (network: string): network is Network => {
  return Object.keys(precision).includes(network)
}

export class Thorchain {
  private midgard: DefaultApi
  private provider?: ethers.providers.JsonRpcProvider

  constructor(args: ThorchainArgs) {
    const midgardConfig = new Configuration({
      basePath: args.midgardUrl,
      baseOptions: {
        timeout: args.timeout ?? 10000,
      },
    })

    this.midgard = new DefaultApi(midgardConfig)
    this.provider = new ethers.providers.JsonRpcProvider(args.rpcUrl)
  }

  // NOTE: contract precision is static and can be saved to prevent the need to always look up on chain
  private async toNativePrecision(amount: string, network: string, contractAddress?: string): Promise<string> {
    if (!isNetworkSupported(network)) {
      throw new Error(`unsupported network when trying to convert to base precision: ${network}`)
    }

    let nativePrecision = precision[network]

    if (network === 'ETH' && contractAddress) {
      // contract address is all uppercase resulting in 0X prefix which ethers doesn't like
      // lower case contract address and call getAddress to verify and convert to checksum format
      const address = ethers.utils.getAddress(contractAddress.toLowerCase())
      const contract = new ethers.Contract(address, ABI, this.provider)
      nativePrecision = await contract.decimals()
    }

    return new BigNumber(amount).times(new BigNumber(10).pow(nativePrecision - precision.THOR)).toString(10)
  }

  async getTxDetails(txid: string, type: ActionType): Promise<TxDetails> {
    const { data, status, statusText } = await this.midgard.getActions({
      limit: 1,
      offset: 0,
      txid: txid,
      type: type,
    })

    if (status !== 200) {
      throw new Error(`${txid} (${type}) - non 200 response: ${statusText}`)
    }

    if (data.count !== '1') {
      throw new Error(`${txid} (${type}) - expected actions: 1, received: ${data.count}`)
    }

    const action = data.actions[0]

    if (action.status !== 'success') {
      throw new Error(`${txid} (${type}) - unable to parse ${action.status} action`)
    }

    const outCoins = action.out[0].coins
    const inCoins = action.in[0].coins
    const feeCoins = action.metadata[type]?.networkFees ?? []

    // aggregate coin values
    const [output, input, fee] = [outCoins, inCoins, feeCoins].map((coins) =>
      (coins ?? []).reduce<Value>(
        (prev, coin) => {
          const [network, assetString] = coin.asset.split('.')
          const [asset, contractAddress] = assetString.split('-')

          if (prev.network && prev.network !== network) {
            throw new Error(`multiple networks found for ${type}: ${action}`)
          }

          if (prev.asset && prev.asset !== asset) {
            throw new Error(`multiple assets found for ${type}: ${action}`)
          }

          const coinAmount = new BigNumber(coin.amount)
          const amount = new BigNumber(prev.amount).plus(coinAmount.isNaN() ? 0 : coinAmount).toString(10)

          return { ...prev, asset, network, contractAddress, amount }
        },
        { amount: '0', asset: '', network: '' }
      )
    )

    // convert amount to native precision
    output.amount = await this.toNativePrecision(output.amount, output.network, output.contractAddress)
    input.amount = await this.toNativePrecision(input.amount, input.network, input.contractAddress)
    fee.amount = await this.toNativePrecision(fee.amount, fee.network, fee.contractAddress)

    const liquidityFee = action.metadata.swap?.liquidityFee

    return { output, input, fee, liquidityFee }
  }
}
