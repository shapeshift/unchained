import { getAddress } from 'viem'

export * from './abi'
export * from './models'
export * from './moralisService'

export const formatAddress = (address: string | undefined): string => (address ? getAddress(address) : '')
