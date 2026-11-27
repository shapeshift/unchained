import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

const sha256 = (data: Buffer): Buffer => createHash('sha256').update(data).digest()

const base58CheckEncode = (payload: Buffer): string => {
  const data = Buffer.concat([payload, sha256(sha256(payload)).subarray(0, 4)])
  let num = BigInt(`0x${data.toString('hex')}`)
  let str = ''
  while (num > 0) {
    str = BASE58_ALPHABET[Number(num % BigInt(58))] + str
    num /= BigInt(58)
  }
  for (const byte of data) {
    if (byte !== 0) break
    str = `1${str}`
  }
  return str
}

const base58CheckDecode = (str: string): Buffer => {
  let num = BigInt(0)
  for (const char of str) num = num * BigInt(58) + BigInt(BASE58_ALPHABET.indexOf(char))
  return Buffer.from(num.toString(16).padStart(164, '0'), 'hex').subarray(0, -4)
}

// base58check address with the given hex version prefix and a deterministic hash
const legacy = (version: string, hashLength = 20) =>
  base58CheckEncode(
    Buffer.concat([Buffer.from(version, 'hex'), Buffer.from(Array.from({ length: hashLength }, (_, i) => i + 1))])
  )

// real bip32 account xpub (BIP-32 test vector 1, m/0H) re-encoded with another extended key version
const XPUB =
  'xpub68Gmy5EdvgibQVfPdqkBBCHxA5htiqg55crXYuXoQRKfDBFA1WEjWgP6LHhwBZeNK1VTsfTFUHCdrfp1bgwQ9xv5ski8PX9rL2dZXvgGDnw'
const extendedKey = (version: string) =>
  base58CheckEncode(Buffer.concat([Buffer.from(version, 'hex'), base58CheckDecode(XPUB).subarray(4)]))

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

describe('utxo address validation (encoding rules)', () => {
  const segwitRaw = (prefix: string, encoder: typeof bech32, version: number, program: number) =>
    encoder.encode(prefix, [version, ...words(program, version)])

  it('bitcoin segwit witness version, program length and checksum variant', () => {
    const valid = [
      segwit('bc', 0, 20),
      segwit('bc', 0, 32),
      segwit('bc', 1, 32),
      segwit('bc', 16, 2),
      segwit('bc', 2, 40),
      segwit('tb', 1, 32),
      segwit('bcrt', 0, 20),
      // BIP-350 test vectors
      'bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y',
      'BC1SW50QGDZ25J',
      'bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs',
      'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c',
    ]
    assertAll(validateBitcoinAddress, valid, true)

    const invalid = [
      // version 0 with a 21 byte program
      segwit('bc', 0, 21),
      segwit('bc', 0, 33),
      // wrong checksum variant
      segwitRaw('bc', bech32m, 0, 20),
      segwitRaw('bc', bech32, 1, 32),
      // program too short / too long
      segwit('bc', 1, 1),
      segwit('bc', 1, 41),
      // BIP-350 invalid test vectors
      'tc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq5zuyut',
      'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd',
      'BC1S0XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ54WELL',
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh',
      'bc1zw508d6qejxtdg4y5r3zarvaryvqyzf3du',
      'bc1gmk9yu',
      // non zero padding
      'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7v07qwwzcrf',
      // longer than the 90 character segwit limit
      bech32m.encode('bc', [1, ...words(64, 1)], 1023),
    ]
    assertAll(validateBitcoinAddress, invalid, false)
  })

  it('litecoin segwit rules', () => {
    assertAll(validateLitecoinAddress, [segwit('ltc', 1, 32), segwit('rltc', 0, 32)], true)
    assertAll(
      validateLitecoinAddress,
      [segwit('ltc', 0, 21), segwitRaw('ltc', bech32m, 0, 20), segwitRaw('ltc', bech32, 1, 32)],
      false
    )
  })

  it('base58 version bytes and payload lengths', () => {
    // bitcoin address is not a dogecoin address
    assert.equal(validateDogecoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'), false)
    // dogecoin address is not a bitcoin address
    assert.equal(validateBitcoinAddress('DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L'), false)
    // litecoin address is not a bitcoin cash address
    assert.equal(validateBitcoinCashAddress('LaMT348PWRnrqeeWArpwQPbuanpXDZGEUz'), false)
    // bitcoin address is not a zcash address
    assert.equal(validateZcashAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'), false)

    // mainnet, testnet and regtest P2PKH/P2SH
    assertAll(
      validateBitcoinAddress,
      ['00', '05', '6f', 'c4'].map((v) => legacy(v)),
      true
    )
    assertAll(
      validateBitcoinAddress,
      ['mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', '2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc'],
      true
    )
    assertAll(
      validateBitcoinCashAddress,
      ['00', '05', '6f', 'c4'].map((v) => legacy(v)),
      true
    )
    assertAll(
      validateLitecoinAddress,
      ['30', '32', '05', '6f', '3a', 'c4'].map((v) => legacy(v)),
      true
    )
    assertAll(
      validateDogecoinAddress,
      ['1e', '16', '71', 'c4', '6f'].map((v) => legacy(v)),
      true
    )
    assertAll(
      validateZcashAddress,
      ['1cb8', '1cbd', '1d25', '1cba'].map((v) => legacy(v)),
      true
    )

    // wrong version for chain
    assertAll(
      validateBitcoinAddress,
      ['30', '1e', '01'].map((v) => legacy(v)),
      false
    )
    assertAll(
      validateLitecoinAddress,
      ['00', '1e'].map((v) => legacy(v)),
      false
    )
    assertAll(
      validateDogecoinAddress,
      ['00', '05', '30'].map((v) => legacy(v)),
      false
    )
    assertAll(
      validateZcashAddress,
      ['00', '1c', '1cb9'].map((v) => legacy(v)),
      false
    )

    // wrong payload length
    assertAll(validateBitcoinAddress, [legacy('00', 19), legacy('00', 21), legacy('05', 32)], false)
    assertAll(validateDogecoinAddress, [legacy('1e', 19), legacy('1e', 21)], false)
    assertAll(validateZcashAddress, [legacy('1cb8', 19), legacy('1cb8', 21)], false)
  })

  it('extended public keys', () => {
    const slip132 = [
      XPUB,
      'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8',
      'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs',
      ...['049d7cb2', '0295b43f', '02aa7ed3', '043587cf', '044a5262', '045f1cf6', '024289ef', '02575483'].map(
        extendedKey
      ),
    ]
    for (const validate of [
      validateBitcoinAddress,
      validateBitcoinCashAddress,
      validateLitecoinAddress,
      validateDogecoinAddress,
      validateZcashAddress,
    ]) {
      assertAll(validate, slip132, true)
    }

    const ltub =
      'Ltub2Y7kcBUex83ugweUDti4nZ2YDWZRCfhTiWeApFcDFz7svCWeJCmyJpz7m6dQhuUJ7XpdfByBitKRshyc7tNSTPkuXy32i6TLMqPCzbm7r8s'
    assertAll(validateLitecoinAddress, [ltub, extendedKey('01b26ef6'), extendedKey('0436f6e1')], true)
    assertAll(validateDogecoinAddress, [extendedKey('02facafd'), extendedKey('0432a9a8')], true)

    // chain specific versions are not accepted on other chains
    assertAll(validateBitcoinAddress, [ltub, extendedKey('02facafd')], false)
    assertAll(validateDogecoinAddress, [ltub], false)
    // unknown version, truncated payload
    assertAll(validateBitcoinAddress, [extendedKey('0488ade4'), extendedKey('deadbeef'), legacy('0488b21e', 70)], false)
  })

  it('cashaddr payload', () => {
    const valid = [
      // CashAddr spec test vectors (20, 24, 32 and 64 byte hashes)
      'bitcoincash:qr6m7j9njldwwzlg9v7v53unlr4jkmx6eylep8ekg2',
      'bchtest:pr6m7j9njldwwzlg9v7v53unlr4jkmx6eyvwc0uz5t',
      'bitcoincash:q9adhakpwzztepkpwp5z0dq62m6u5v5xtyj7j3h2ws4mr9g0',
      'bitcoincash:qvch8mmxy0rtfrlarg7ucrxxfzds5pamg73h7370aa87d80gyhqxq5nlegake',
      'bitcoincash:qlg0x333p4238k0qrc5ej7rzfw5g8e4a4r6vvzyrcy8j3s5k0en7calvclhw46hudk5flttj6ydvjc0pv3nchp52amk97tqa5zygg96mtky5sv5w',
      // token aware P2PKH (CHIP-2022-02)
      'bitcoincash:zr6m7j9njldwwzlg9v7v53unlr4jkmx6eycnjehshe',
    ]
    assertAll(validateBitcoinCashAddress, valid, true)

    const invalid = [
      // CashAddr spec vector with a valid checksum but an invalid payload
      'bchreg:555555555555555555555555555555555555555555555udxmlmrz',
      'bitcoincash:' + 'q'.repeat(200),
    ]
    assertAll(validateBitcoinCashAddress, invalid, false)
  })

  it('rejects oversized input before decoding', () => {
    const oversized = ['1'.repeat(113), 'z'.repeat(100000), `bc1${'q'.repeat(100000)}`]
    for (const validate of [
      validateBitcoinAddress,
      validateBitcoinCashAddress,
      validateLitecoinAddress,
      validateDogecoinAddress,
      validateZcashAddress,
    ]) {
      assertAll(validate, oversized, false)
    }
  })
})
