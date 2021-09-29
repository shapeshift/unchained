import { ethers } from 'ethers'
import { Tx } from '@shapeshiftoss/blockbook'
import { ParseTxUnique, TxTransfers } from '@shapeshiftoss/common-ingester'
import ABI from './abi/uniV2'
import ERC20_ABI from './abi/erc20'
import { getSigHash } from './utils'

const NODE_ENV = process.env.NODE_ENV
const RPC_URL = process.env.RPC_URL as string
let COINSTACK = process.env.COINSTACK
let NETWORK = process.env.NETWORK

if (NODE_ENV !== 'test') {
  if (!RPC_URL) throw new Error('RPC_URL env var not set')
  if (!COINSTACK) throw new Error('COINSTACK env var not set')
  if (!NETWORK) throw new Error('NETWORK env var not set')
} else {
  COINSTACK = 'ethereum'
  NETWORK = 'MAINNET'
}

const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
const abiInterface = new ethers.utils.Interface(ABI)

export const ROUTER_CONTRACT = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
export const FACTORY_CONTRACT = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
export const WETH_CONTRACT = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
export const INIT_CODE_HASH = '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f'
export const ADD_LIQUIDITY_ETH_SIG_HASH = abiInterface.getSighash('addLiquidityETH')
export const REMOVE_LIQUIDITY_ETH_SIG_HASH = abiInterface.getSighash('removeLiquidityETH')

const pairFor = (tokenA: string, tokenB: string): string => {
  const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA]
  const salt = ethers.utils.solidityKeccak256(['address', 'address'], [token0, token1])
  return ethers.utils.getCreate2Address(FACTORY_CONTRACT, salt, INIT_CODE_HASH)
}

// detect pending token transfers not picked up by blockbook
export const parse = async (tx: Tx): Promise<ParseTxUnique | undefined> => {
  if (!tx.ethereumSpecific?.data) return
  if (tx.confirmations !== 0) return

  switch (getSigHash(tx.ethereumSpecific.data)) {
    case ADD_LIQUIDITY_ETH_SIG_HASH: {
      const result = abiInterface.decodeFunctionData(ADD_LIQUIDITY_ETH_SIG_HASH, tx.ethereumSpecific.data)

      const tokenAddress = ethers.utils.getAddress(result.token.toLowerCase())
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)
      const decimals = await contract.decimals()
      const name = await contract.name()
      const symbol = await contract.symbol()
      const value = result.amountTokenDesired.toString()
      const assetId = `${COINSTACK}_${NETWORK}_${tokenAddress}`

      const send: TxTransfers = {
        [assetId]: {
          totalValue: value,
          components: [{ value }],
          token: { contract: tokenAddress, decimals, name, symbol },
        },
      }

      return { send }
    }
    case REMOVE_LIQUIDITY_ETH_SIG_HASH: {
      const result = abiInterface.decodeFunctionData(REMOVE_LIQUIDITY_ETH_SIG_HASH, tx.ethereumSpecific.data)

      const tokenAddress = ethers.utils.getAddress(result.token.toLowerCase())
      const lpTokenAddress = pairFor(tokenAddress, WETH_CONTRACT)
      const contract = new ethers.Contract(lpTokenAddress, ERC20_ABI, provider)
      const decimals = await contract.decimals()
      const name = await contract.name()
      const symbol = await contract.symbol()
      const value = result.liquidity.toString()
      const assetId = `${COINSTACK}_${NETWORK}_${lpTokenAddress}`

      const send: TxTransfers = {
        [assetId]: {
          totalValue: value,
          components: [{ value }],
          token: { contract: lpTokenAddress, decimals, name, symbol },
        },
      }

      return { send }
    }
    default:
      return
  }
}
