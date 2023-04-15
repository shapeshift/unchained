import { ethers } from 'ethers'

export const formatAddress = (address: string): string => ethers.getAddress(address)
