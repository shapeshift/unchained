import { NON_EVM_CHAINS } from './constants'

export const isLikelyNonEvm = (chainId: number): boolean => {
  return chainId > 1_000_000
}

export const getChainConfig = (numericChainId: number): { chainId: string; slip44: number; isEvm: boolean } => {
  const nonEvmConfig = NON_EVM_CHAINS[numericChainId]
  if (nonEvmConfig) {
    return { ...nonEvmConfig, isEvm: false }
  }

  if (isLikelyNonEvm(numericChainId)) {
    return {
      chainId: `unknown:${numericChainId}`,
      slip44: 0,
      isEvm: false,
    }
  }

  return {
    chainId: `eip155:${numericChainId}`,
    slip44: 60,
    isEvm: true,
  }
}

export const buildAssetId = (
  chainId: string,
  slip44: number,
  tokenAddress: string,
  isEvm: boolean
): string => {
  const normalizedAddress = tokenAddress.toLowerCase()
  const isNativeToken =
    normalizedAddress === '0x0000000000000000000000000000000000000000' ||
    normalizedAddress === '11111111111111111111111111111111'

  if (isNativeToken) {
    return `${chainId}/slip44:${slip44}`
  }

  if (isEvm) {
    return `${chainId}/erc20:${normalizedAddress}`
  }

  return `${chainId}/slip44:${slip44}`
}
