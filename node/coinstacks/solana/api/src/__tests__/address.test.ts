import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Keypair } from '@solana/web3.js'
import { validateAddress } from '../address'

describe('solana address validation', () => {
  it('accepts valid addresses', () => {
    const valid = [
      '11111111111111111111111111111111',
      'So11111111111111111111111111111111111111112',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      Keypair.generate().publicKey.toBase58(),
    ]
    for (const address of valid) assert.equal(validateAddress(address), true, address)
  })

  it('rejects invalid addresses', () => {
    const invalid = [
      'constructor',
      '__proto__',
      'toString',
      'hasOwnProperty',
      '',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEG',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1vv',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt10',
      '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed',
    ]
    for (const address of invalid) assert.equal(validateAddress(address), false, address)
  })
})
