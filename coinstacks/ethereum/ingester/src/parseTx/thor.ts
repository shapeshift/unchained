import { ethers } from 'ethers'
import { Tx } from '@shapeshiftoss/blockbook'
import { ParseTxUnique, Refund, Trade } from '@shapeshiftoss/common-ingester'
import { Thorchain } from '@shapeshiftoss/thorchain'
import { logger } from '../logger'
import { InternalTx } from '../types'
import ABI from './abi/thor'
import { aggregateSell, getSigHash } from './utils'

const MIDGARD_URL = process.env.MIDGARD_URL as string
const NETWORK = process.env.NETWORK as 'mainnet' | 'ropsten'
const NODE_ENV = process.env.NODE_ENV
const RPC_URL = process.env.RPC_URL as string

if (NODE_ENV !== 'test') {
  if (!MIDGARD_URL) throw new Error('MIDGARD_URL env var not set')
  if (!NETWORK) throw new Error('NETWORK env var not set')
  if (!RPC_URL) throw new Error('RPC_URL env var not set')
}

const thorchain = new Thorchain({ midgardUrl: MIDGARD_URL })
const abiInterface = new ethers.utils.Interface(ABI)

export const DEPOSIT_SIG_HASH = abiInterface.getSighash('deposit')
export const TRANSFEROUT_SIG_HASH = abiInterface.getSighash('transferOut')
export const ROUTER_CONTRACT = {
  mainnet: '0xC145990E84155416144C532E31f89B840Ca8c2cE',
  ropsten: '0xefA28233838f46a80AaaC8c309077a9ba70D123A',
}[NETWORK]

const SWAP_TYPES = ['SWAP', '=', 's']

// detect address associated with transferOut internal transaction
export const getInternalAddress = (inputData: string): string | undefined => {
  if (getSigHash(inputData) !== TRANSFEROUT_SIG_HASH) return

  const result = abiInterface.decodeFunctionData(TRANSFEROUT_SIG_HASH, inputData)

  const [type] = result.memo.split(':')
  if (type !== 'OUT' || type !== 'REFUND') return

  return result.to
}

const moduleLogger = logger.child({ namespace: ['parseTx', 'thor'] })
export const parse = async (
  tx: Tx,
  address: string,
  internalTxs?: Array<InternalTx>
): Promise<ParseTxUnique | undefined> => {
  if (!tx.ethereumSpecific?.data) return

  let result: ethers.utils.Result
  switch (getSigHash(tx.ethereumSpecific.data)) {
    case DEPOSIT_SIG_HASH:
      result = abiInterface.decodeFunctionData(DEPOSIT_SIG_HASH, tx.ethereumSpecific.data)
      break
    case TRANSFEROUT_SIG_HASH: {
      result = abiInterface.decodeFunctionData(TRANSFEROUT_SIG_HASH, tx.ethereumSpecific.data)
      break
    }
    default:
      return
  }

  const [type, ...memo] = result.memo.split(':')

  // sell side
  if (SWAP_TYPES.includes(type)) {
    const [buyAsset] = memo
    const { sellAmount, sellAsset } = aggregateSell(tx, address, internalTxs)

    if (result.amount.toString() !== sellAmount) {
      moduleLogger.warn(
        { fn: 'parse', txid: tx.txid, address },
        'Swap amount specified differs from amount sent for tx'
      )
    }

    const trade: Trade = {
      dexName: 'thor',
      buyAmount: '',
      buyAsset,
      feeAsset: '',
      feeAmount: '',
      memo: result.memo,
      sellAmount,
      sellAsset,
    }

    return { trade }
  }

  // buy side
  if (type === 'OUT') {
    const { input, fee, output, liquidityFee } = await thorchain.getTxDetails(memo, 'swap')

    const trade: Trade = {
      dexName: 'thor',
      buyAmount: output.amount,
      buyAsset: output.asset,
      buyNetwork: output.network,
      feeAmount: fee.amount,
      feeAsset: fee.asset,
      feeNetwork: fee.network,
      memo: result.memo,
      sellAmount: input.amount,
      sellAsset: input.asset,
      sellNetwork: input.network,
      liquidityFee,
    }

    return { trade }
  }

  // trade refund
  if (type === 'REFUND') {
    const { input, fee, output } = await thorchain.getTxDetails(memo, 'refund')

    const refund: Refund = {
      dexName: 'thor',
      feeAmount: fee.amount,
      feeAsset: fee.asset,
      feeNetwork: fee.network,
      memo: result.memo,
      refundAmount: output.amount,
      refundAsset: output.asset,
      refundNetwork: output.network,
      sellAmount: input.amount,
      sellAsset: input.asset,
      sellNetwork: input.network,
    }

    return { refund }
  }

  return
}
