import { caip19, AssetNamespace } from '@shapeshiftoss/caip'
import { ChainTypes } from '@shapeshiftoss/types'
import { Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import { ethers } from 'ethers'
import { Transfer, TransferType, TxParser } from '../../types'
import { Network, SubParser, TxSpecific } from '../types'
import UNIV2_ABI from './abi/uniV2'
import ERC20_ABI from './abi/erc20'
import { getSigHash, toNetworkType, txInteractsWithContract } from './utils'
import { UNI_V2_ROUTER_CONTRACT, WETH_CONTRACT_MAINNET, WETH_CONTRACT_ROPSTEN } from './constants'

export interface ParserArgs {
  network: Network
  provider: ethers.providers.JsonRpcProvider
}

export class Parser implements SubParser {
  abiInterface = new ethers.utils.Interface(UNIV2_ABI)
  network: Network
  provider: ethers.providers.JsonRpcProvider

  readonly addLiquidityEthSigHash: string
  readonly removeLiquidityEthSigHash: string
  readonly wethContract: string

  constructor(args: ParserArgs) {
    this.network = args.network
    this.provider = args.provider

    this.addLiquidityEthSigHash = this.abiInterface.getSighash('addLiquidityETH')
    this.removeLiquidityEthSigHash = this.abiInterface.getSighash('removeLiquidityETH')
    this.wethContract = {
      mainnet: WETH_CONTRACT_MAINNET,
      ropsten: WETH_CONTRACT_ROPSTEN,
    }[this.network]
  }

  async parse(tx: BlockbookTx): Promise<TxSpecific | undefined> {
    if (!tx.ethereumSpecific?.data) return
    if (!txInteractsWithContract(tx, UNI_V2_ROUTER_CONTRACT)) return
    if (!(tx.confirmations === 0)) return

    const transfers = await this.getTransfers(tx)
    const decoded = this.abiInterface.parseTransaction({ data: tx.ethereumSpecific.data })

    return {
      transfers,
      data: {
        parser: TxParser.UniV2,
        method: decoded.name,
      },
    }
  }

  private static pairFor(tokenA: string, tokenB: string): string {
    const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA]
    const factoryContract = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
    const salt = ethers.utils.solidityKeccak256(['address', 'address'], [token0, token1])
    const initCodeHash = '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f' // https://github.com/Uniswap/v2-periphery/blob/dda62473e2da448bc9cb8f4514dadda4aeede5f4/contracts/libraries/UniswapV2Library.sol#L24
    return ethers.utils.getCreate2Address(factoryContract, salt, initCodeHash)
  }

  private async getTransfers(tx: BlockbookTx): Promise<Transfer[] | undefined> {
    const data = tx.ethereumSpecific?.data
    if (!data) return
    const sendAddress = tx.vin[0].addresses?.[0] ?? ''
    switch (getSigHash(data)) {
      case this.addLiquidityEthSigHash: {
        const result = this.abiInterface.decodeFunctionData(this.addLiquidityEthSigHash, data)

        const tokenAddress = ethers.utils.getAddress(result.token.toLowerCase())
        const lpTokenAddress = Parser.pairFor(tokenAddress, this.wethContract)
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider)
        const decimals = await contract.decimals()
        const name = await contract.name()
        const symbol = await contract.symbol()
        const value = result.amountTokenDesired.toString()

        return [
          {
            type: TransferType.Send,
            from: sendAddress,
            to: lpTokenAddress,
            caip19: caip19.toCAIP19({
              chain: ChainTypes.Ethereum,
              network: toNetworkType(this.network),
              assetNamespace: AssetNamespace.ERC20,
              assetReference: tokenAddress,
            }),
            assetId: caip19.toCAIP19({
              chain: ChainTypes.Ethereum,
              network: toNetworkType(this.network),
              assetNamespace: AssetNamespace.ERC20,
              assetReference: tokenAddress,
            }),
            totalValue: value,
            components: [{ value }],
            token: { contract: tokenAddress, decimals, name, symbol },
          },
        ]
      }
      case this.removeLiquidityEthSigHash: {
        const result = this.abiInterface.decodeFunctionData(this.removeLiquidityEthSigHash, data)

        const tokenAddress = ethers.utils.getAddress(result.token.toLowerCase())
        const lpTokenAddress = Parser.pairFor(tokenAddress, this.wethContract)
        const contract = new ethers.Contract(lpTokenAddress, ERC20_ABI, this.provider)
        const decimals = await contract.decimals()
        const name = await contract.name()
        const symbol = await contract.symbol()
        const value = result.liquidity.toString()

        return [
          {
            type: TransferType.Send,
            from: sendAddress,
            to: lpTokenAddress,
            caip19: caip19.toCAIP19({
              chain: ChainTypes.Ethereum,
              network: toNetworkType(this.network),
              assetNamespace: AssetNamespace.ERC20,
              assetReference: lpTokenAddress,
            }),
            assetId: caip19.toCAIP19({
              chain: ChainTypes.Ethereum,
              network: toNetworkType(this.network),
              assetNamespace: AssetNamespace.ERC20,
              assetReference: lpTokenAddress,
            }),
            totalValue: value,
            components: [{ value }],
            token: { contract: lpTokenAddress, decimals, name, symbol },
          },
        ]
      }
      default:
        return
    }
  }
}
