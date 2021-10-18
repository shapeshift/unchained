import { ethers } from 'ethers'
import { Tx } from '@shapeshiftoss/blockbook'
import { ParseTxUnique, TxTransfers } from '@shapeshiftoss/common-ingester'
import ABI from './abi/uniV2'
import ERC20_ABI from './abi/erc20'
import { getSigHash } from './utils'

const NETWORK = process.env.NETWORK as 'mainnet' | 'ropsten'
const NODE_ENV = process.env.NODE_ENV
const RPC_URL = process.env.RPC_URL as string

if (NODE_ENV !== 'test') {
  if (!NETWORK) throw new Error('NETWORK env var not set')
  if (!RPC_URL) throw new Error('RPC_URL env var not set')
}

const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
const abiInterface = new ethers.utils.Interface(ABI)

export const ADD_LIQUIDITY_ETH_SIG_HASH = abiInterface.getSighash('addLiquidityETH')
export const REMOVE_LIQUIDITY_ETH_SIG_HASH = abiInterface.getSighash('removeLiquidityETH')
export const INIT_CODE_HASH = '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f' // https://github.com/Uniswap/v2-periphery/blob/dda62473e2da448bc9cb8f4514dadda4aeede5f4/contracts/libraries/UniswapV2Library.sol#L24
export const ROUTER_CONTRACT = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
export const FACTORY_CONTRACT = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
export const WETH_CONTRACT = {
  mainnet: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  ropsten: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
}[NETWORK]

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

      const send: TxTransfers = {
        [symbol]: {
          totalValue: value,
          components: [{ value }],
          token: { contract: tokenAddress, decimals, name },
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

      const send: TxTransfers = {
        [symbol]: {
          totalValue: value,
          components: [{ value }],
          token: { contract: lpTokenAddress, decimals, name },
        },
      }

      return { send }
    }
    default:
      return
  }
}
