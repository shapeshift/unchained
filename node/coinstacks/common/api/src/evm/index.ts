import { getAddress } from 'viem'

export * from './abi'
export * from './l1GasPrice'
export * from './models'
export * from './moralisService'
export * from './rfox'

export const formatAddress = (address: string | undefined): string => (address ? getAddress(address) : '')
