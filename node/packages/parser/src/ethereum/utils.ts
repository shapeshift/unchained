import { NetworkTypes } from '@shapeshiftoss/types'
import { Tx } from '@shapeshiftoss/blockbook'
import { TransferType, Tx as ParseTx } from '../types'
import { Network } from './types'
import { ABI } from 'abi-decoder'

export const toNetworkType = (network: Network): NetworkTypes => {
  switch (network) {
    case 'mainnet':
      return NetworkTypes.MAINNET
    case 'ropsten':
      return NetworkTypes.ETH_ROPSTEN
    default:
      throw new Error('unsupported network')
  }
}

export const getSigHash = (inputData: string | undefined): string | undefined => {
  if (!inputData) return
  const length = inputData.startsWith('0x') ? 10 : 8
  return inputData.slice(0, length)
}

export const txInteractsWithContract = (tx: Tx, contract: string) => {
  const receiveAddress = tx.vout[0].addresses?.[0] ?? ''
  return receiveAddress === contract
}

export const getStandardTx = (tx: ParseTx | undefined) => (tx?.transfers?.length === 1 ? tx.transfers[0] : undefined)

export const getBuyTx = (tx: ParseTx | undefined) =>
  tx?.trade ? tx.transfers?.find((t) => t.type === TransferType.Receive) : undefined

export const getSellTx = (tx: ParseTx | undefined) => {
  return tx?.trade ? tx.transfers?.find((t) => t.type === TransferType.Send) : undefined
}

const itemToFragment = (item: ABI.Item) => ({ ...item, gas: item.gas?.toString() })
export const itemsToFragments = (items: ABI.Item[]) => items.map(itemToFragment)
