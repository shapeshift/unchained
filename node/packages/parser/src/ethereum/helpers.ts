import { EthereumSpecific, Tx } from '@shapeshiftoss/blockbook'

export const txMatchesContract = (tx: Tx, contract: string) => {
  const receiveAddress = tx.vout[0].addresses?.[0] ?? ''
  return receiveAddress === contract
}

export const isEthereumSpecific = (
  maybeEthereumSpecific: EthereumSpecific | undefined
): maybeEthereumSpecific is EthereumSpecific => !!maybeEthereumSpecific
