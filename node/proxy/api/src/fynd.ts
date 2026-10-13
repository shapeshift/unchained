import { Logger } from '@shapeshiftoss/logger'
import axios, { isAxiosError } from 'axios'
import { Request, Response } from 'express'
import { Address, Hex, decodeFunctionData, isAddress, isAddressEqual, isHex, keccak256, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const FYND_API_KEY = process.env.FYND_API_KEY
const FYND_FEE_SIGNER_KEY = process.env.FYND_FEE_SIGNER_KEY

if (!FYND_API_KEY) throw new Error('FYND_API_KEY env var not set')
if (!FYND_FEE_SIGNER_KEY) throw new Error('FYND_FEE_SIGNER_KEY env var not set')

const BASE_URL = 'https://fynd-api.propellerheads.xyz/v1'

const FEE_DEADLINE_SECONDS = 15 * 60
const MAX_FEE_BPS = 10_000
const FEE_UNITS_PER_BPS = 10_000
const SIGNATURE_BYTES = 65
const ZERO_SIGNATURE = '00'.repeat(SIGNATURE_BYTES)

type Chain = { chainId: number; router: Address }

// Hosted Fynd chain slugs and their TychoRouterV3 deployments
// https://docs.propellerheads.xyz/tycho/for-solvers/execution/contract-addresses
const CHAINS = new Map<string, Chain>([
  ['ethereum', { chainId: 1, router: '0x1644D2477f809cc2C71bCCFd6Dc9497E3F83210d' }],
  ['base', { chainId: 8453, router: '0xAbA5B53b03eAfaD1C5fc8BD5Fc765fC85Bb3de67' }],
  ['arbitrum', { chainId: 42161, router: '0x924F147c50eA59f5180a26031A8b65B2aA1e81Cd' }],
  ['bsc', { chainId: 56, router: '0x7f3D12BBaFb8955E51B3ab9588b34c8ad95BDA4e' }],
  ['polygon', { chainId: 137, router: '0xbd4e6011F03355C2A377Fd9Af939322A7d0A1bC1' }],
  ['unichain', { chainId: 130, router: '0xCba5574597Ad00EA250Fd106DAB4Fc7461949635' }],
  ['robinhood', { chainId: 4663, router: '0x09215a470bD585E59EB3F4B612fBD2678131fF9e' }],
])

// Entry points Fynd encodes for transfer_from quotes; permit2 and vault variants are never requested
const ROUTER_ABI = parseAbi([
  'struct ClientFeeParams { uint32 clientFeeBps; address clientFeeReceiver; uint256 maxClientContribution; uint256 deadline; bytes clientSignature; }',
  'function singleSwap(uint256 amountIn, address tokenIn, address tokenOut, uint256 expectedAmountOut, uint256 minAmountOut, address receiver, ClientFeeParams clientFeeParams, bytes swapData)',
  'function sequentialSwap(uint256 amountIn, address tokenIn, address tokenOut, uint256 expectedAmountOut, uint256 minAmountOut, address receiver, ClientFeeParams clientFeeParams, bytes swaps)',
  'function splitSwap(uint256 amountIn, address tokenIn, address tokenOut, uint256 expectedAmountOut, uint256 minAmountOut, uint256 nTokens, address receiver, ClientFeeParams clientFeeParams, bytes swaps)',
])

const CLIENT_FEE_TYPES = {
  ClientFee: [
    { name: 'clientFeeBps', type: 'uint32' },
    { name: 'clientFeeReceiver', type: 'address' },
    { name: 'maxClientContribution', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'amountIn', type: 'uint256' },
    { name: 'tokenIn', type: 'address' },
    { name: 'tokenOut', type: 'address' },
    { name: 'expectedAmountOut', type: 'uint256' },
    { name: 'minAmountOut', type: 'uint256' },
    { name: 'receiver', type: 'address' },
    { name: 'swaps', type: 'bytes' },
  ],
} as const

type ClientFee = { bps: number; deadline: number }

type FyndTransaction = { to?: string; data?: string; client_fee_signature_offset?: number | null }

type FyndOrder = {
  status?: string
  transaction?: FyndTransaction
  fee_breakdown?: { swaps_hash?: string | null }
  client_fee_deadline?: number
}

type FyndQuote = { orders?: FyndOrder[] }

// Signing failures carry our own messages, so they are safe to relay to the client
class FeeSigningError extends Error {}

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const isFeeBps = (value: unknown): value is number => isNonNegativeInteger(value) && value <= MAX_FEE_BPS

// splitSwap carries nTokens at index 5; the other entry points share one argument shape
const decodeSwap = (calldata: Hex) => {
  const decoded = (() => {
    try {
      return decodeFunctionData({ abi: ROUTER_ABI, data: calldata })
    } catch {
      throw new FeeSigningError('quote calls an unsupported router function')
    }
  })()

  if (decoded.functionName === 'splitSwap') {
    const [amountIn, tokenIn, tokenOut, expectedAmountOut, minAmountOut, , receiver, params, swaps] = decoded.args
    return { params, swap: { amountIn, tokenIn, tokenOut, expectedAmountOut, minAmountOut, receiver, swaps } }
  }

  const [amountIn, tokenIn, tokenOut, expectedAmountOut, minAmountOut, receiver, params, swaps] = decoded.args

  return { params, swap: { amountIn, tokenIn, tokenOut, expectedAmountOut, minAmountOut, receiver, swaps } }
}

export class Fynd {
  private axiosInstance = axios.create({ headers: { Authorization: FYND_API_KEY }, timeout: 10_000 })
  private signer = privateKeyToAccount(FYND_FEE_SIGNER_KEY as Hex)

  constructor(private logger: Logger) {}

  async handler(req: Request, res: Response): Promise<void> {
    const slug = req.path.match(/^\/api\/v1\/fynd\/([^/]+)\/quote$/)?.[1] ?? ''

    const chain = CHAINS.get(slug)
    if (!chain) {
      res.status(404).send('Not Found')
      return
    }

    const requestedBps: unknown = req.body?.options?.encoding_options?.client_fee_params?.bps
    if (requestedBps !== undefined && !isFeeBps(requestedBps)) {
      res.status(400).send('Invalid client fee bps')
      return
    }

    const fee: ClientFee | undefined = isFeeBps(requestedBps)
      ? { bps: requestedBps, deadline: Math.floor(Date.now() / 1000) + FEE_DEADLINE_SECONDS }
      : undefined

    // Callers choose the bps; the empty signature makes Fynd encode a zeroed placeholder and report its offset
    if (fee) {
      req.body.options.encoding_options.client_fee_params = {
        bps: fee.bps,
        receiver: this.signer.address,
        max_contribution: '0',
        deadline: fee.deadline,
        signature: '0x',
      }
    }

    try {
      const response = await this.axiosInstance.post<FyndQuote>(`${BASE_URL}/${slug}/quote`, req.body)

      if (fee) await this.signClientFees(response.data, chain, fee)

      Object.entries(response.headers).forEach(([k, v]) => res.set(k, v))
      res.status(response.status).send(response.data)
    } catch (err) {
      this.relayError(res, err)
    }
  }

  private relayError(res: Response, err: unknown): void {
    if (err instanceof FeeSigningError) {
      res.status(502).send(`Fynd fee signing failed: ${err.message}`)
      return
    }

    if (!isAxiosError(err)) {
      this.logger.error({ err }, 'Fynd proxy request failed')
      res.status(500).send('Internal Server Error')
      return
    }

    // Preserve upstream backoff guidance and make it readable by browser clients
    const retryAfter = err.response?.headers['retry-after']
    if (typeof retryAfter === 'string') {
      res.set('Retry-After', retryAfter)
      res.append('Access-Control-Expose-Headers', 'Retry-After')
    }

    res.status(err.response?.status ?? 500).send(err.response?.data || 'Internal Server Error')
  }

  // Signs the fee over each successful order exactly as Fynd encoded it; anything the proxy did not request is rejected
  private async signClientFees(quote: FyndQuote, chain: Chain, fee: ClientFee): Promise<void> {
    for (const order of quote.orders ?? []) {
      if (order.status !== 'success' || !order.transaction) continue

      order.transaction.data = await this.signTransaction(
        order.transaction,
        order.fee_breakdown?.swaps_hash,
        chain,
        fee
      )

      order.client_fee_deadline = fee.deadline
    }
  }

  // Returns the calldata with the EIP-712 ClientFee signature patched into the zeroed placeholder
  private async signTransaction(
    tx: FyndTransaction,
    swapsHash: string | null | undefined,
    chain: Chain,
    fee: ClientFee
  ): Promise<Hex> {
    const { to, data: calldata, client_fee_signature_offset: offset } = tx

    if (typeof to !== 'string' || !isAddress(to) || !isAddressEqual(to, chain.router)) {
      throw new FeeSigningError('quote targets an unpinned router')
    }

    if (!isHex(calldata, { strict: true }) || calldata.length % 2 !== 0) {
      throw new FeeSigningError('quote calldata is not hex')
    }

    if (!isNonNegativeInteger(offset)) throw new FeeSigningError('quote has no client fee signature offset')

    const { params, swap } = decodeSwap(calldata)

    if (
      params.clientFeeBps !== fee.bps * FEE_UNITS_PER_BPS ||
      !isAddressEqual(params.clientFeeReceiver, this.signer.address) ||
      params.maxClientContribution !== 0n ||
      params.deadline !== BigInt(fee.deadline)
    ) {
      throw new FeeSigningError('encoded client fee params do not match the request')
    }

    if (typeof swapsHash === 'string' && swapsHash.toLowerCase() !== keccak256(swap.swaps)) {
      throw new FeeSigningError('encoded swaps do not match swaps_hash')
    }

    const start = 2 + offset * 2
    const end = start + SIGNATURE_BYTES * 2

    if (end > calldata.length) throw new FeeSigningError('signature offset does not fit the calldata')

    if (calldata.slice(start, end) !== ZERO_SIGNATURE) {
      throw new FeeSigningError('signature offset does not point at the zeroed placeholder')
    }

    const signature = await this.signer.signTypedData({
      domain: { name: 'TychoRouter', version: '1', chainId: chain.chainId, verifyingContract: chain.router },
      types: CLIENT_FEE_TYPES,
      primaryType: 'ClientFee',
      message: {
        clientFeeBps: params.clientFeeBps,
        clientFeeReceiver: params.clientFeeReceiver,
        maxClientContribution: params.maxClientContribution,
        deadline: params.deadline,
        ...swap,
      },
    })

    return `0x${calldata.slice(2, start)}${signature.slice(2)}${calldata.slice(end)}`
  }
}
