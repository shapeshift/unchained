import { PublicKey } from '@solana/web3.js'

/**
 * Validate a base58 encoded 32 byte solana address (account, program or token account)
 */
export const validateAddress = (address: string): boolean => {
  // a 32 byte value encodes to 32-44 base58 characters, reject anything else before decoding
  if (address.length < 32 || address.length > 44) return false

  try {
    return new PublicKey(address).toBase58() === address
  } catch (err) {
    return false
  }
}
