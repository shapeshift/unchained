import { NetworkTypes } from '@shapeshiftoss/types'
import { Network } from './types'
import { ABI } from 'abi-decoder'

export const getSigHash = (inputData: string | undefined): string | undefined => {
  if (!inputData) return
  const length = inputData.startsWith('0x') ? 10 : 8
  return inputData.substr(0, length)
}

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

const itemToFragment = (item: ABI.Item) => ({ ...item, gas: item.gas?.toString() })
export const itemsToFragments = (items: ABI.Item[]) => items.map(itemToFragment)
