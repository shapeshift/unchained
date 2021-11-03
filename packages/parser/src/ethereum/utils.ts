import { BigNumber } from 'bignumber.js'
import { Tx } from '@shapeshiftoss/blockbook'
import { Trade } from '../types'
import { InternalTx } from './types'

type Buy = Pick<Trade, 'buyAsset' | 'buyAmount'>
type Sell = Pick<Trade, 'sellAsset' | 'sellAmount'>

// aggregates all buy side (receive) token transfers, internal eth transfers, or eth
export const aggregateBuy = (tx: Tx, address: string, internalTxs?: Array<InternalTx>): Buy => {
  // eth buy
  const value = new BigNumber(tx.value)
  if (!value.isNaN() && value.gt(0) && tx.vout[0]?.addresses?.[0] === address) {
    return { buyAsset: 'ETH', buyAmount: tx.value }
  }

  // eth internal buy
  const txs = internalTxs?.filter((tx) => tx.to === address)
  if (txs?.length) {
    return txs.reduce<Buy>(
      (prev, tx) => {
        const value = new BigNumber(tx.value)
        const buyAmount = new BigNumber(prev.buyAmount).plus(value.isNaN() ? 0 : value).toString(10)
        return { ...prev, buyAmount }
      },
      { buyAsset: 'ETH', buyAmount: '0' }
    )
  }

  // token buy
  const transfers = tx.tokenTransfers?.filter((transfer) => transfer.to === address)
  if (transfers?.length) {
    return transfers.reduce<Buy>(
      (prev, transfer) => {
        if (prev.buyAsset && transfer.symbol !== prev.buyAsset) {
          throw new Error(`multiple buy assets detected in tx: ${tx.txid}, for address: ${address}`)
        }

        const value = new BigNumber(transfer.value)
        const buyAmount = new BigNumber(prev.buyAmount).plus(value.isNaN() ? 0 : value).toString(10)

        return { ...prev, buyAsset: transfer.symbol, buyAmount }
      },
      { buyAsset: '', buyAmount: '0' }
    )
  }

  // no buy found
  return { buyAsset: '', buyAmount: '' }
}

// aggregates all sell side (send) token transfers, internal eth transfers, or eth
export const aggregateSell = (tx: Tx, address: string, internalTxs?: Array<InternalTx>): Sell => {
  // eth sell
  const value = new BigNumber(tx.value)
  if (!value.isNaN() && value.gt(0) && tx.vin[0]?.addresses?.[0] === address) {
    return { sellAsset: 'ETH', sellAmount: tx.value }
  }

  // eth internal sell
  const txs = internalTxs?.filter((tx) => tx.from === address)
  if (txs?.length) {
    return txs.reduce<Sell>(
      (prev, tx) => {
        const value = new BigNumber(tx.value)
        const sellAmount = new BigNumber(prev.sellAmount).plus(value.isNaN() ? 0 : value).toString(10)
        return { ...prev, sellAmount }
      },
      { sellAsset: 'ETH', sellAmount: '0' }
    )
  }

  // token sell
  const transfers = tx.tokenTransfers?.filter((transfer) => transfer.from === address)
  if (transfers?.length) {
    return transfers.reduce<Sell>(
      (prev, transfer) => {
        if (prev.sellAsset && transfer.symbol !== prev.sellAsset) {
          throw new Error(`multiple sell assets detected in tx: ${tx.txid}, for address: ${address}`)
        }

        const value = new BigNumber(transfer.value)
        const sellAmount = new BigNumber(prev.sellAmount).plus(value.isNaN() ? 0 : value).toString(10)

        return { ...prev, sellAsset: transfer.symbol, sellAmount }
      },
      { sellAsset: '', sellAmount: '0' }
    )
  }

  // no sell found
  return { sellAsset: '', sellAmount: '' }
}

export const getSigHash = (inputData: string | undefined): string | undefined => {
  if (!inputData) return
  const length = inputData.startsWith('0x') ? 10 : 8
  return inputData.substr(0, length)
}
