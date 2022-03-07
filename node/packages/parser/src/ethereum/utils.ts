import { NetworkTypes } from '@shapeshiftoss/types'
import { Tx } from '@shapeshiftoss/blockbook'
import { Network } from './types'
import { ethers } from 'ethers'
import MULTISIG_ABI from './abi/multiSig'

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

export const SENDMULTISIG_SIG_HASH = ((): string => {
  const abiInterface = new ethers.utils.Interface(MULTISIG_ABI)
  return abiInterface.getSighash('sendMultiSig')
})()

// detect address associated with sendMultiSig internal transaction
export const getInternalMultisigAddress = (inputData: string): string | undefined => {
  const abiInterface = new ethers.utils.Interface(MULTISIG_ABI)
  if (getSigHash(inputData) !== SENDMULTISIG_SIG_HASH) return
  const result = abiInterface.decodeFunctionData(SENDMULTISIG_SIG_HASH, inputData)
  return result.toAddress
}
