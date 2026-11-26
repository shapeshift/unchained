import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bech32, bech32m } from 'bech32'
import {
  validateBitcoinAddress,
  validateBitcoinCashAddress,
  validateDogecoinAddress,
  validateLitecoinAddress,
  validateZcashAddress,
} from '../utxo/address'

const INHERITED_NAMES = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'prototype']

// deterministic witness program / payload words for generated bech32 addresses
const words = (length: number, seed: number) => bech32.toWords(Array.from({ length }, (_, i) => (i * 31 + seed) & 0xff))

const segwit = (prefix: string, version: number, program: number) => {
  const encoder = version === 0 ? bech32 : bech32m
  return encoder.encode(prefix, [version, ...words(program, version)])
}

// flip one character to break the checksum while keeping the charset valid
const corrupt = (address: string): string => {
  const i = address.length - 2
  const swap = address[i] === 'q' ? 'p' : 'q'
  return address.slice(0, i) + swap + address.slice(i + 1)
}

const assertAll = (validate: (address: string) => boolean, addresses: Array<string>, expected: boolean) => {
  for (const address of addresses) assert.equal(validate(address), expected, address)
}

describe('utxo address validation', () => {
  it('bitcoin', () => {
    const valid = [
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
      'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      'BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4'.toLowerCase(),
      'BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4',
      'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3',
      'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
      'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
      segwit('bc', 0, 20),
      segwit('bc', 1, 32),
      segwit('bcrt', 0, 32),
      'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz',
    ]
    assertAll(validateBitcoinAddress, valid, true)

    const invalid = [
      ...INHERITED_NAMES,
      '',
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb',
      corrupt('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'),
      segwit('ltc', 0, 20),
      'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5Mdq',
    ]
    assertAll(validateBitcoinAddress, invalid, false)
  })

  it('litecoin', () => {
    const valid = [
      'LaMT348PWRnrqeeWArpwQPbuanpXDZGEUz',
      'MQMcJhpWHYVeQArcZR3sBgyPZxxRtnH441',
      'ltc1qg42tkwuuxefutzxezdkdel39gfstuap288mfea',
      segwit('ltc', 0, 20),
      segwit('ltc', 0, 32),
      segwit('tltc', 0, 20),
    ]
    assertAll(validateLitecoinAddress, valid, true)

    const invalid = [...INHERITED_NAMES, segwit('bc', 0, 20), corrupt(segwit('ltc', 0, 20))]
    assertAll(validateLitecoinAddress, invalid, false)
  })

  it('bitcoin cash', () => {
    const valid = [
      '1BpEi6DfDAUFd7GtittLSdBeYJvcoaVggu',
      'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a',
      'bitcoincash:ppm2qsznhks23z7629mms6s4cwef74vcwvn0h829pq',
      'BITCOINCASH:QPM2QSZNHKS23Z7629MMS6S4CWEF74VCWVY22GDX6A',
      'qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a',
      'ppm2qsznhks23z7629mms6s4cwef74vcwvn0h829pq',
      'bchtest:qpm2qsznhks23z7629mms6s4cwef74vcwvqcw003ap',
    ]
    assertAll(validateBitcoinCashAddress, valid, true)

    const invalid = [
      ...INHERITED_NAMES,
      'bitcoincash:constructor',
      'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6b',
      'bchtest:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a',
      'bitcoincash:Qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a',
      'foo:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a',
    ]
    assertAll(validateBitcoinCashAddress, invalid, false)
  })

  it('dogecoin', () => {
    const valid = ['DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L', 'A8c3xNz2mqsDLFwv5KL5fpH12QEwDaoTXo']
    assertAll(validateDogecoinAddress, valid, true)

    const invalid = [...INHERITED_NAMES, 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7M', segwit('bc', 0, 20)]
    assertAll(validateDogecoinAddress, invalid, false)
  })

  it('zcash', () => {
    const valid = [
      't1HycwCyBNC6kXG2Ug3rNdprwcMjUS4K6eZ',
      't3Vz22vK5z2LcKEdg16Yv4FFneEL1zg9ojd',
      // sapling (bech32, 43 byte payload) and unified (bech32m, longer than the default 90 character limit)
      bech32.encode('zs', words(43, 1), 1023),
      bech32m.encode('u', words(107, 2), 1023),
      bech32m.encode('tex', words(20, 3), 1023),
    ]
    assertAll(validateZcashAddress, valid, true)

    const invalid = [
      ...INHERITED_NAMES,
      't1HycwCyBNC6kXG2Ug3rNdprwcMjUS4K6eY',
      corrupt(bech32m.encode('u', words(107, 2), 1023)),
      segwit('bc', 0, 20),
    ]
    assertAll(validateZcashAddress, invalid, false)
  })
})
