import { PublicKey } from '@solana/web3.js'

/**
 * Validate a base58 encoded 32 byte solana address (account, program or token account)
 */
export const validateAddress = (address: string): boolean => {
  try {
    return new PublicKey(address).toBase58() === address
  } catch (err) {
    return false
  }
}
