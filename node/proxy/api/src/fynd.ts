import axios, { isAxiosError } from 'axios'
import { Axios } from 'axios'
import { Request, Response } from 'express'
import {
  Address,
  Hex,
  bytesToHex,
  decodeFunctionData,
  getAddress,
  hashTypedData,
  hexToBytes,
  isHex,
  keccak256,
  parseAbi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const FYND_API_KEY = process.env.FYND_API_KEY
// Signs client fees. Sealed in railway, generated in-platform; see the fee receiver notes in web.
const FYND_FEE_SIGNER_KEY = process.env.FYND_FEE_SIGNER_KEY
// Defaults to the signer address; set to an ERC-1271 receiver contract once one is deployed.
const FYND_FEE_RECEIVER = process.env.FYND_FEE_RECEIVER

if (!FYND_API_KEY) throw new Error('FYND_API_KEY env var not set')

const BASE_URL = 'https://fynd-api.propellerheads.xyz/v1'
const FEE_DEADLINE_SECONDS = 15 * 60
const SIGNATURE_BYTES = 65
// The router takes the fee in FeeCalculator units: 1 bps = 10,000
const FEE_UNITS_PER_BPS = 10_000n

// Hosted Fynd chain slugs and their TychoRouterV3 deployments
// https://docs.propellerheads.xyz/tycho/for-solvers/execution/contract-addresses
const CHAINS: Record<string, { chainId: number; router: Address }> = {
  ethereum: { chainId: 1, router: '0x1644D2477f809cc2C71bCCFd6Dc9497E3F83210d' },
  base: { chainId: 8453, router: '0xAbA5B53b03eAfaD1C5fc8BD5Fc765fC85Bb3de67' },
  arbitrum: { chainId: 42161, router: '0x924F147c50eA59f5180a26031A8b65B2aA1e81Cd' },
  bsc: { chainId: 56, router: '0x7f3D12BBaFb8955E51B3ab9588b34c8ad95BDA4e' },
  polygon: { chainId: 137, router: '0xbd4e6011F03355C2A377Fd9Af939322A7d0A1bC1' },
  unichain: { chainId: 130, router: '0xCba5574597Ad00EA250Fd106DAB4Fc7461949635' },
  robinhood: { chainId: 4663, router: '0x09215a470bD585E59EB3F4B612fBD2678131fF9e' },
}

// Fynd License 1.0 §3.4 requires this notice wherever Fynd quotes are supplied to others.
const LICENSE_NOTICE =
  'Fynd quotes are licensed under the Fynd License 1.0 (https://github.com/propeller-heads/fynd/blob/main/LICENSE.md). ' +
  'Trades must settle through the Fynd router listed in the Router Registry ' +
  "(https://docs.propellerheads.xyz/tycho/for-solvers/execution/contract-addresses), and the router's fees may not be bypassed."

// Entry points Fynd encodes for transfer_from quotes. Permit2 and vault variants are never requested, so they are not signed.
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

type ClientFee = { bps: number; receiver: Address; deadline: number }

type FyndOrder = {
  status?: string
  transaction?: { to?: string; data?: string; client_fee_signature_offset?: number | null }
  fee_breakdown?: { swaps_hash?: string | null }
  client_fee_deadline?: number
}

export class Fynd {
  private axiosInstance: Axios
  private signer = FYND_FEE_SIGNER_KEY ? privateKeyToAccount(FYND_FEE_SIGNER_KEY as Hex) : undefined
  private feeReceiver: Address | undefined

  constructor() {
    this.axiosInstance = axios.create({
      headers: { Authorization: FYND_API_KEY },
      timeout: 10_000,
    })
    this.feeReceiver = this.signer ? getAddress(FYND_FEE_RECEIVER ?? this.signer.address) : undefined
  }

  async handler(req: Request, res: Response): Promise<void> {
    const parsedUrl = new URL(req.url, 'https://dummy.com')
    const [, chain, endpoint, ...rest] = parsedUrl.pathname.replace(/^\/api\/v1\/fynd/, '').split('/')

    if (!CHAINS[chain] || endpoint !== 'quote' || rest.length) {
      res.status(404).send('Not Found')
      return
    }

    const encodingOptions = req.body?.options?.encoding_options
    const requestedBps: unknown = encodingOptions?.client_fee_params?.bps
    let fee: ClientFee | undefined

    if (requestedBps !== undefined) {
      if (!this.signer || !this.feeReceiver) {
        res.status(503).send('Fynd fee signing is not configured')
        return
      }
      if (!Number.isInteger(requestedBps) || (requestedBps as number) < 0 || (requestedBps as number) > 10_000) {
        res.status(400).send('Invalid client fee bps')
        return
      }
      fee = {
        bps: requestedBps as number,
        receiver: this.feeReceiver,
        deadline: Math.floor(Date.now() / 1000) + FEE_DEADLINE_SECONDS,
      }
      // Callers choose the bps; the receiver, contribution cap and deadline are ours
      encodingOptions.client_fee_params = {
        bps: fee.bps,
        receiver: fee.receiver,
        max_contribution: '0',
        deadline: fee.deadline,
      }
    }

    try {
      const response = await this.axiosInstance.post(`${BASE_URL}/${chain}/quote`, req.body)

      if (fee) {
        try {
          await this.signClientFees(response.data, CHAINS[chain], fee)
        } catch (err) {
          res.status(502).send(`Fynd fee signing failed: ${err instanceof Error ? err.message : 'unknown error'}`)
          return
        }
      }

      Object.entries(response.headers).forEach(([k, v]) => res.set(k, v))
      res.set('Fynd-License-Notice', LICENSE_NOTICE)
      res.append('Access-Control-Expose-Headers', 'Fynd-License-Notice')
      res.status(response.status).send(response.data)
    } catch (err) {
      if (isAxiosError(err)) {
        // Preserve upstream backoff guidance and make it readable by browser clients.
        const retryAfter = err.response?.headers['retry-after']
        if (typeof retryAfter === 'string') {
          res.set('Retry-After', retryAfter)
          res.append('Access-Control-Expose-Headers', 'Retry-After')
        }

        res.status(err.response?.status ?? 500).send(err.response?.data || 'Internal Server Error')
      } else if (err instanceof Error) {
        res.status(500).send(err.message || 'Internal Server Error')
      } else {
        res.status(500).send('Internal Server Error')
      }
    }
  }

  // Signs the EIP-712 ClientFee message over the swap exactly as Fynd encoded it and patches the
  // signature into the calldata placeholder. Rejects any quote whose encoded fee params differ
  // from the ones this proxy injected.
  private async signClientFees(data: unknown, chain: { chainId: number; router: Address }, fee: ClientFee) {
    if (!this.signer) throw new Error('fee signer not configured')
    const orders: FyndOrder[] = Array.isArray((data as { orders?: unknown })?.orders)
      ? (data as { orders: FyndOrder[] }).orders
      : []

    for (const order of orders) {
      if (order.status !== 'success' || !order.transaction) continue
      const { to, data: calldata, client_fee_signature_offset: offset } = order.transaction

      if (typeof to !== 'string' || getAddress(to) !== chain.router) throw new Error('quote targets an unpinned router')
      if (!isHex(calldata, { strict: true }) || calldata.length % 2 !== 0) throw new Error('quote calldata is not hex')
      if (!Number.isInteger(offset) || (offset as number) < 0)
        throw new Error('quote has no client fee signature offset')

      const { functionName, args } = decodeFunctionData({ abi: ROUTER_ABI, data: calldata })
      const isSplit = functionName === 'splitSwap'
      const decoded = args as unknown as readonly unknown[]
      const [amountIn, tokenIn, tokenOut, expectedAmountOut, minAmountOut] = decoded as [
        bigint,
        Address,
        Address,
        bigint,
        bigint,
      ]
      const receiver = decoded[isSplit ? 6 : 5] as Address
      const params = decoded[isSplit ? 7 : 6] as {
        clientFeeBps: number
        clientFeeReceiver: Address
        maxClientContribution: bigint
        deadline: bigint
        clientSignature: Hex
      }
      const swaps = decoded[isSplit ? 8 : 7] as Hex

      if (
        BigInt(params.clientFeeBps) !== BigInt(fee.bps) * FEE_UNITS_PER_BPS ||
        getAddress(params.clientFeeReceiver) !== fee.receiver ||
        params.maxClientContribution !== 0n ||
        params.deadline !== BigInt(fee.deadline)
      ) {
        throw new Error('encoded client fee params do not match the request')
      }
      const swapsHash = order.fee_breakdown?.swaps_hash
      if (typeof swapsHash === 'string' && swapsHash.toLowerCase() !== keccak256(swaps)) {
        throw new Error('encoded swaps do not match swaps_hash')
      }

      const bytes = hexToBytes(calldata)
      const end = (offset as number) + SIGNATURE_BYTES
      if (end > bytes.length) throw new Error('signature offset does not fit the calldata')
      if (bytes.subarray(offset as number, end).some((byte) => byte !== 0)) {
        throw new Error('signature offset does not point at the zeroed placeholder')
      }

      const digest = hashTypedData({
        domain: { name: 'TychoRouter', version: '1', chainId: chain.chainId, verifyingContract: chain.router },
        types: CLIENT_FEE_TYPES,
        primaryType: 'ClientFee',
        message: {
          clientFeeBps: params.clientFeeBps,
          clientFeeReceiver: fee.receiver,
          maxClientContribution: 0n,
          deadline: BigInt(fee.deadline),
          amountIn,
          tokenIn,
          tokenOut,
          expectedAmountOut,
          minAmountOut,
          receiver,
          swaps,
        },
      })
      const signature = await this.signer.sign({ hash: digest })

      bytes.set(hexToBytes(signature), offset as number)
      order.transaction.data = bytesToHex(bytes)
      order.client_fee_deadline = fee.deadline
    }
  }
}
