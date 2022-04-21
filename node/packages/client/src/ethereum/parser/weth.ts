import { caip19, AssetNamespace } from '@shapeshiftoss/caip'
import { ChainTypes } from '@shapeshiftoss/types'
import { Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import { ethers } from 'ethers'
import { TransferType, TxParser } from '../../types'
import { Network, SubParser, TxSpecific } from '../types'
import WETH_ABI from './abi/weth'
import { getSigHash, toNetworkType, txInteractsWithContract } from './utils'
import { WETH_CONTRACT_MAINNET, WETH_CONTRACT_ROPSTEN } from './constants'
import ERC20_ABI from './abi/erc20'

export interface ParserArgs {
  network: Network
  provider: ethers.providers.JsonRpcProvider
}

export class Parser implements SubParser {
  abiInterface = new ethers.utils.Interface(WETH_ABI)
  network: Network
  provider: ethers.providers.JsonRpcProvider

  readonly depositSigHash: string
  readonly withdrawalSigHash: string
  readonly wethContract: string

  constructor(args: ParserArgs) {
    this.network = args.network
    this.provider = args.provider

    this.depositSigHash = this.abiInterface.getSighash('deposit')
    this.withdrawalSigHash = this.abiInterface.getSighash('withdraw')
    this.wethContract = {
      mainnet: WETH_CONTRACT_MAINNET,
      ropsten: WETH_CONTRACT_ROPSTEN,
    }[this.network]
  }

  async parse(tx: BlockbookTx): Promise<TxSpecific | undefined> {
    const txData = tx.ethereumSpecific?.data
    if (!txInteractsWithContract(tx, this.wethContract)) return
    if (!txData) return

    const decoded = this.abiInterface.parseTransaction({ data: txData })

    const contract = new ethers.Contract(this.wethContract, ERC20_ABI, this.provider)
    const sendAddress = tx.vin[0].addresses?.[0] ?? ''
    const decimals = await contract.decimals()
    const name = await contract.name()
    const symbol = await contract.symbol()

    const transfers = (() => {
      switch (getSigHash(txData)) {
        case this.depositSigHash: {
          const value = tx.value
          return [
            {
              type: TransferType.Send,
              from: sendAddress,
              to: this.wethContract,
              caip19: caip19.toCAIP19({
                chain: ChainTypes.Ethereum,
                network: toNetworkType(this.network),
                assetNamespace: AssetNamespace.ERC20,
                assetReference: this.wethContract,
              }),
              totalValue: value,
              components: [{ value }],
              token: {
                contract: this.wethContract,
                decimals,
                name,
                symbol,
              },
            },
          ]
        }
        case this.withdrawalSigHash: {
          const result = this.abiInterface.decodeFunctionData(this.withdrawalSigHash, txData)
          const value = result.wad.toString()
          return [
            {
              type: TransferType.Receive,
              from: this.wethContract,
              to: sendAddress,
              caip19: caip19.toCAIP19({
                chain: ChainTypes.Ethereum,
                network: toNetworkType(this.network),
                assetNamespace: AssetNamespace.ERC20,
                assetReference: this.wethContract,
              }),
              totalValue: value,
              components: [{ value }],
              token: {
                contract: this.wethContract,
                decimals,
                name,
                symbol,
              },
            },
          ]
        }
        default:
          return undefined
      }
    })()

    // We didn't recognise the sigHash - exit
    if (!transfers) return

    const data = {
      parser: TxParser.WETH,
      method: decoded.name,
    }

    return {
      transfers,
      data,
    }
  }
}
