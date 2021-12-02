import { ethers } from 'ethers'
import ABI from './abi/multiSig'
import { getSigHash } from './utils'

const abiInterface = new ethers.utils.Interface(ABI)

export const SENDMULTISIG_SIG_HASH = abiInterface.getSighash('sendMultiSig')

// detect address associated with sendMultiSig internal transaction
export const getInternalAddress = (inputData: string): string | undefined => {
  if (getSigHash(inputData) !== SENDMULTISIG_SIG_HASH) return

  const result = abiInterface.decodeFunctionData(SENDMULTISIG_SIG_HASH, inputData)

  return result.toAddress
}
