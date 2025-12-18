import { encodeAbiParameters, parseAbiParameters } from 'viem'
import { Fees } from '.'
import { BUTTERSWAP_AFFILIATE_ID, BUTTERSWAP_CONTRACT, MAP_CHAIN_ID, MAP_RPC_URL, MAP_USDT_ADDRESS } from './constants'

const BLOCK_TIME_SECONDS = 5
const USDT_DECIMALS = 18
const TOKEN_LIST_API = 'https://butterapi.chainservice.io/api/token/bam/list'
const TOKEN_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

const GET_TOTAL_BALANCE_SELECTOR = '0x47b2f8d9'
const API_SUCCESS_CODE = 0
const HEX_RADIX = 16
const HEX_PREFIX_LENGTH = 2
const UINT256_HEX_LENGTH = 66 // 0x prefix (2) + 64 hex chars

type RpcResponse<T> = {
  jsonrpc: string
  id: number
  result: T
  error?: { code: number; message: string }
}

type TokenListResponse = {
  errno: number
  message: string
  data: {
    items: Array<{ address: string; symbol: string }>
    total: number
  }
}

// Fallback token list in case API is unavailable
const FALLBACK_TOKENS = [
  '0x05ab928d446d8ce6761e368c8e7be03c3168a9ec', // ETH
  '0x33daba9618a75a7aff103e53afe530fbacf4a3dd', // USDT
  '0x9f722b2cb30093f766221fd0d37964949ed66918', // USDC
  '0xb877e3562a660c7861117c2f1361a26abaf19beb', // BTC
  '0x5de6606ae1250c64560a603b40078de268240fdd', // SOL
  '0xc478a25240d9c072ebec5109b417e0a78a41667c', // BNB
  '0x593a37fe0f6dfd0b6c5a051e9a44aa0f6922a1a2', // TRX
  '0x0e9e7317c7132604c009c9860a259a3da33a3ed3', // TONCOIN
]

let cachedTokens: string[] | null = null
let tokensCachedAt = 0

const fetchTokenList = async (): Promise<string[]> => {
  const now = Date.now()
  if (cachedTokens && now - tokensCachedAt < TOKEN_CACHE_TTL_MS) {
    return cachedTokens
  }

  try {
    const response = await fetch(TOKEN_LIST_API)
    const data: TokenListResponse = await response.json()

    if (data.errno === API_SUCCESS_CODE && data.data?.items?.length > 0) {
      cachedTokens = data.data.items.map((t) => t.address.toLowerCase())
      tokensCachedAt = now
      return cachedTokens
    }
  } catch {
    // Fall through to return fallback tokens
  }

  return FALLBACK_TOKENS
}

const rpcCall = async <T>(method: string, params: unknown[]): Promise<T> => {
  const response = await fetch(MAP_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  })

  const data: RpcResponse<T> = await response.json()

  if (data.error) {
    throw new Error(`RPC error: ${data.error.message}`)
  }

  return data.result
}

const getBlockNumber = async (): Promise<number> => {
  const result = await rpcCall<string>('eth_blockNumber', [])
  return parseInt(result, HEX_RADIX)
}

const getTotalBalance = async (blockNumber: number, tokens: string[]): Promise<bigint> => {
  const params = encodeAbiParameters(parseAbiParameters('uint256, address[], address'), [
    BigInt(BUTTERSWAP_AFFILIATE_ID),
    tokens as `0x${string}`[],
    MAP_USDT_ADDRESS as `0x${string}`,
  ])

  const data = GET_TOTAL_BALANCE_SELECTOR + params.slice(HEX_PREFIX_LENGTH)
  const blockHex = `0x${blockNumber.toString(HEX_RADIX)}`

  const result = await rpcCall<string>('eth_call', [{ to: BUTTERSWAP_CONTRACT, data }, blockHex])

  return BigInt(result.slice(0, UINT256_HEX_LENGTH))
}

const estimateBlockFromTimestamp = (
  currentBlock: number,
  currentTimestamp: number,
  targetTimestamp: number
): number => {
  const blocksAgo = Math.floor((currentTimestamp - targetTimestamp) / BLOCK_TIME_SECONDS)
  const estimatedBlock = currentBlock - blocksAgo
  return Math.max(0, Math.min(estimatedBlock, currentBlock))
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const tokens = await fetchTokenList()

  const currentBlock = await getBlockNumber()
  const now = Math.floor(Date.now() / 1000)

  const startBlock = estimateBlockFromTimestamp(currentBlock, now, startTimestamp)
  const endBlock = estimateBlockFromTimestamp(currentBlock, now, endTimestamp)

  let balanceAtStart: bigint
  let balanceAtEnd: bigint

  try {
    ;[balanceAtStart, balanceAtEnd] = await Promise.all([
      getTotalBalance(startBlock, tokens),
      getTotalBalance(endBlock, tokens),
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to query ButterSwap balance: ${message}`)
  }

  const feesForPeriod = balanceAtEnd - balanceAtStart

  if (feesForPeriod <= BigInt(0)) {
    return []
  }

  const feesUsd = Number(feesForPeriod) / 10 ** USDT_DECIMALS

  return [
    {
      service: 'butterswap',
      amount: feesForPeriod.toString(),
      amountUsd: feesUsd.toString(),
      chainId: MAP_CHAIN_ID,
      assetId: `${MAP_CHAIN_ID}/erc20:${MAP_USDT_ADDRESS}`,
      timestamp: endTimestamp,
      txHash: '',
    },
  ]
}
