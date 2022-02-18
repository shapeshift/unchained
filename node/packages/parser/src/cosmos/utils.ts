import { NetworkTypes } from '@shapeshiftoss/types'
import { Network } from './types'

export const toNetworkType = (network: Network): NetworkTypes => {
  switch (network) {
    case 'mainnet':
      return NetworkTypes.COSMOSHUB_MAINNET
    default:
      throw new Error('unsupported network')
  }
}
