import { ethers } from 'ethers'
import { Tx } from '@shapeshiftoss/blockbook'
import { caip19 } from '@shapeshiftoss/caip'
import { ChainTypes, ContractTypes } from '@shapeshiftoss/types'
import { Transfer, TransferType, TxSpecific as ParseTxSpecific, UniV2Tx } from '../types'
import { Network } from './types'
import ABI from './abi/uniV2'
import ERC20_ABI from './abi/erc20'
import { getSigHash, itemsToFragments, toNetworkType } from './utils'
import { txInteractsWithContract } from './helpers'
import { GenericParser } from './index'

export const ROUTER_CONTRACT = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'

export interface ParserArgs {
  network: Network
  provider: ethers.providers.JsonRpcProvider
}

export class Parser implements GenericParser {
  abiInterface: ethers.utils.Interface
  network: Network
  provider: ethers.providers.JsonRpcProvider

  readonly addLiquidityEthSigHash: string
  readonly removeLiquidityEthSigHash: string
  readonly wethContract: string

  constructor(args: ParserArgs) {
    this.abiInterface = new ethers.utils.Interface(itemsToFragments(ABI))
    this.network = args.network
    this.provider = args.provider

    this.addLiquidityEthSigHash = this.abiInterface.getSighash('addLiquidityETH')
    this.removeLiquidityEthSigHash = this.abiInterface.getSighash('removeLiquidityETH')
    this.wethContract = {
      mainnet: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      ropsten: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
    }[this.network]
  }

  async parse(tx: Tx): Promise<ParseTxSpecific<UniV2Tx> | undefined> {
    if (!txInteractsWithContract(tx, ROUTER_CONTRACT)) return
    if (!(tx.confirmations === 0)) return
    if (!tx.ethereumSpecific?.data) return

    const sendAddress = tx.vin[0].addresses?.[0] ?? ''

    switch (getSigHash(tx.ethereumSpecific.data)) {
      case this.addLiquidityEthSigHash: {
        const result = this.abiInterface.decodeFunctionData(this.addLiquidityEthSigHash, tx.ethereumSpecific.data)

        const tokenAddress = ethers.utils.getAddress(result.token.toLowerCase())
        const lpTokenAddress = Parser.pairFor(tokenAddress, this.wethContract)
        const contract = new ethers.Contract(tokenAddress, itemsToFragments(ERC20_ABI), this.provider)
        const decimals = await contract.decimals()
        const name = await contract.name()
        const symbol = await contract.symbol()
        const value = result.amountTokenDesired.toString()

        const transfers: Array<Transfer> = [
          {
            type: TransferType.Send,
            from: sendAddress,
            to: lpTokenAddress,
            caip19: caip19.toCAIP19({
              chain: ChainTypes.Ethereum,
              network: toNetworkType(this.network),
              contractType: ContractTypes.ERC20,
              tokenId: tokenAddress,
            }),
            totalValue: value,
            components: [{ value }],
            token: { contract: tokenAddress, decimals, name, symbol },
          },
        ]

        return { transfers }
      }
      case this.removeLiquidityEthSigHash: {
        const result = this.abiInterface.decodeFunctionData(this.removeLiquidityEthSigHash, tx.ethereumSpecific.data)

        const tokenAddress = ethers.utils.getAddress(result.token.toLowerCase())
        const lpTokenAddress = Parser.pairFor(tokenAddress, this.wethContract)
        const contract = new ethers.Contract(lpTokenAddress, itemsToFragments(ERC20_ABI), this.provider)
        const decimals = await contract.decimals()
        const name = await contract.name()
        const symbol = await contract.symbol()
        const value = result.liquidity.toString()

        const transfers: Array<Transfer> = [
          {
            type: TransferType.Send,
            from: sendAddress,
            to: lpTokenAddress,
            caip19: caip19.toCAIP19({
              chain: ChainTypes.Ethereum,
              network: toNetworkType(this.network),
              contractType: ContractTypes.ERC20,
              tokenId: lpTokenAddress,
            }),
            totalValue: value,
            components: [{ value }],
            token: { contract: lpTokenAddress, decimals, name, symbol },
          },
        ]

        return { transfers }
      }
      default:
        return
    }
  }

  private static pairFor(tokenA: string, tokenB: string): string {
    const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA]
    const factoryContract = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
    const salt = ethers.utils.solidityKeccak256(['address', 'address'], [token0, token1])
    const initCodeHash = '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f' // https://github.com/Uniswap/v2-periphery/blob/dda62473e2da448bc9cb8f4514dadda4aeede5f4/contracts/libraries/UniswapV2Library.sol#L24
    return ethers.utils.getCreate2Address(factoryContract, salt, initCodeHash)
  }
}
