import { createHash } from 'crypto'
import { bech32, bech32m } from 'bech32'

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE58_MAP = new Map(Array.from(BASE58_ALPHABET).map((char, i) => [char, BigInt(i)]))

// longest base58check encoding accepted: an extended public key (4 byte version + 74 bytes + 4 byte checksum = 82 bytes)
// encodes to at most ceil(82 * 8 / log2(58)) = 112 characters
const BASE58_MAX_LENGTH = 112

// bech32 limits addresses to 90 characters, but zcash shielded and unified addresses are longer
const BECH32_LIMIT = 1023

// segwit addresses are limited to 90 characters (BIP-173)
const SEGWIT_LIMIT = 90

const sha256 = (data: Buffer): Buffer => createHash('sha256').update(data).digest()

const base58Decode = (str: string): Buffer | undefined => {
  if (!str || str.length > BASE58_MAX_LENGTH) return

  let num = BigInt(0)
  for (const char of str) {
    const value = BASE58_MAP.get(char)
    if (value === undefined) return
    num = num * BigInt(58) + value
  }

  const hex = num ? num.toString(16) : ''
  const bytes = Buffer.from(hex.length % 2 ? `0${hex}` : hex, 'hex')

  let leadingZeros = 0
  while (str[leadingZeros] === '1') leadingZeros++

  return Buffer.concat([Buffer.alloc(leadingZeros), bytes])
}

/**
 * Decode a base58check string and verify its checksum
 *
 * @returns the payload (without checksum), or undefined if invalid
 */
const base58CheckDecode = (str: string): Buffer | undefined => {
  const decoded = base58Decode(str)
  if (!decoded || decoded.length < 5) return

  const payload = decoded.subarray(0, -4)
  const checksum = decoded.subarray(-4)

  if (!sha256(sha256(payload)).subarray(0, 4).equals(checksum)) return

  return payload
}

export interface Base58Versions {
  /** hex encoded version prefixes of P2PKH/P2SH addresses (followed by a 20 byte hash) */
  address: Array<string>
  /** hex encoded 4 byte version prefixes of extended public keys (followed by 74 bytes) */
  extendedKey: Array<string>
}

const HASH_LENGTH = 20
const EXTENDED_KEY_BODY_LENGTH = 74

const hasVersion = (payload: Buffer, versions: Array<string>, bodyLength: number): boolean =>
  versions.some((version) => {
    const versionLength = version.length / 2
    return (
      payload.length === versionLength + bodyLength && payload.subarray(0, versionLength).toString('hex') === version
    )
  })

/**
 * Validate a base58check encoded address (legacy P2PKH/P2SH, zcash transparent addresses) or extended public key
 * against the expected version prefixes and payload lengths
 */
export const isValidBase58CheckAddress = (address: string, versions: Base58Versions): boolean => {
  const payload = base58CheckDecode(address)
  if (!payload) return false

  return (
    hasVersion(payload, versions.address, HASH_LENGTH) ||
    hasVersion(payload, versions.extendedKey, EXTENDED_KEY_BODY_LENGTH)
  )
}

/**
 * Validate a bech32 or bech32m encoded address with one of the expected human readable prefixes
 */
export const isValidBech32Address = (address: string, prefixes: Array<string>): boolean => {
  const decoded = bech32.decodeUnsafe(address, BECH32_LIMIT) ?? bech32m.decodeUnsafe(address, BECH32_LIMIT)
  return !!decoded && prefixes.includes(decoded.prefix)
}

/**
 * Validate a segwit address (BIP-173/BIP-350): witness version, program length, padding and checksum variant
 */
export const isValidSegwitAddress = (address: string, prefixes: Array<string>): boolean => {
  const bech32Decoded = bech32.decodeUnsafe(address, SEGWIT_LIMIT)
  const decoded = bech32Decoded ?? bech32m.decodeUnsafe(address, SEGWIT_LIMIT)
  if (!decoded || !prefixes.includes(decoded.prefix) || !decoded.words.length) return false

  const [version, ...programWords] = decoded.words
  if (version > 16) return false

  // fromWordsUnsafe rejects excess or non zero padding
  const program = bech32.fromWordsUnsafe(programWords)
  if (!program || program.length < 2 || program.length > 40) return false

  // witness version 0 uses bech32, versions 1+ use bech32m
  if (version === 0) return !!bech32Decoded && (program.length === 20 || program.length === 32)
  return !bech32Decoded
}

const CASHADDR_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const CASHADDR_GENERATORS = [
  BigInt('0x98f2bc8e61'),
  BigInt('0x79b76d99e2'),
  BigInt('0xf33e5fb3c4'),
  BigInt('0xae2eabe2a8'),
  BigInt('0x1e4f43e470'),
]

// version byte + 64 byte hash (largest hash size) + 8 character checksum
const CASHADDR_MAX_PAYLOAD_LENGTH = Math.ceil(((1 + 64) * 8) / 5) + 8

// hash size in bytes indexed by the lower 3 bits of the version byte
const CASHADDR_HASH_SIZES = [20, 24, 28, 32, 40, 48, 56, 64]

// P2PKH, P2SH, token aware P2PKH, token aware P2SH
const CASHADDR_MAX_TYPE = 3

const cashaddrPolymod = (values: Array<number>): bigint => {
  let c = BigInt(1)
  for (const d of values) {
    const c0 = c >> BigInt(35)
    c = ((c & BigInt('0x07ffffffff')) << BigInt(5)) ^ BigInt(d)
    CASHADDR_GENERATORS.forEach((generator, i) => {
      if ((c0 >> BigInt(i)) & BigInt(1)) c ^= generator
    })
  }
  return c ^ BigInt(1)
}

/**
 * Validate a bitcoin cash CashAddr address (https://reference.cash/protocol/blockchain/encoding/cashaddr)
 *
 * The prefix is optional and defaults to the first of the expected prefixes when missing.
 */
export const isValidCashAddrAddress = (address: string, prefixes: Array<string>): boolean => {
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) return false

  const lowered = address.toLowerCase()
  const separator = lowered.lastIndexOf(':')
  const prefix = separator === -1 ? prefixes[0] : lowered.slice(0, separator)
  const payload = separator === -1 ? lowered : lowered.slice(separator + 1)

  if (!prefix || !prefixes.includes(prefix)) return false

  // version byte + 20 byte hash + 8 character checksum at minimum
  if (payload.length < 42 || payload.length > CASHADDR_MAX_PAYLOAD_LENGTH) return false

  const data: Array<number> = []
  for (const char of payload) {
    const value = CASHADDR_CHARSET.indexOf(char)
    if (value === -1) return false
    data.push(value)
  }

  const prefixData = Array.from(prefix).map((char) => char.charCodeAt(0) & 0x1f)

  if (cashaddrPolymod([...prefixData, 0, ...data]) !== BigInt(0)) return false

  // fromWordsUnsafe rejects excess or non zero padding
  const bytes = bech32.fromWordsUnsafe(data.slice(0, -8))
  if (!bytes || !bytes.length) return false

  const [version] = bytes
  if (version & 0x80) return false
  if (version >> 3 > CASHADDR_MAX_TYPE) return false

  return bytes.length === 1 + CASHADDR_HASH_SIZES[version & 0x07]
}

// BIP-32/SLIP-132 extended public key versions (xpub, ypub, zpub, Ypub, Zpub, tpub, upub, vpub, Upub, Vpub)
const EXTENDED_KEY_VERSIONS = [
  '0488b21e',
  '049d7cb2',
  '04b24746',
  '0295b43f',
  '02aa7ed3',
  '043587cf',
  '044a5262',
  '045f1cf6',
  '024289ef',
  '02575483',
]

// mainnet P2PKH/P2SH, testnet/regtest P2PKH/P2SH
const BITCOIN_VERSIONS: Base58Versions = {
  address: ['00', '05', '6f', 'c4'],
  extendedKey: EXTENDED_KEY_VERSIONS,
}

// mainnet P2PKH/P2SH/legacy P2SH, testnet/regtest P2PKH/P2SH/legacy P2SH
const LITECOIN_VERSIONS: Base58Versions = {
  address: ['30', '32', '05', '6f', '3a', 'c4'],
  // Ltub, Mtub, ttub
  extendedKey: [...EXTENDED_KEY_VERSIONS, '019da462', '01b26ef6', '0436f6e1'],
}

// mainnet P2PKH/P2SH, testnet P2PKH/P2SH, regtest P2PKH
const DOGECOIN_VERSIONS: Base58Versions = {
  address: ['1e', '16', '71', 'c4', '6f'],
  // dgub, tgub
  extendedKey: [...EXTENDED_KEY_VERSIONS, '02facafd', '0432a9a8'],
}

// mainnet t1/t3, testnet/regtest tm/t2
const ZCASH_VERSIONS: Base58Versions = {
  address: ['1cb8', '1cbd', '1d25', '1cba'],
  extendedKey: EXTENDED_KEY_VERSIONS,
}

export const validateBitcoinAddress = (address: string): boolean =>
  isValidBase58CheckAddress(address, BITCOIN_VERSIONS) || isValidSegwitAddress(address, ['bc', 'tb', 'bcrt'])

export const validateLitecoinAddress = (address: string): boolean =>
  isValidBase58CheckAddress(address, LITECOIN_VERSIONS) || isValidSegwitAddress(address, ['ltc', 'tltc', 'rltc'])

export const validateBitcoinCashAddress = (address: string): boolean =>
  isValidBase58CheckAddress(address, BITCOIN_VERSIONS) ||
  isValidCashAddrAddress(address, ['bitcoincash', 'bchtest', 'bchreg'])

export const validateDogecoinAddress = (address: string): boolean =>
  isValidBase58CheckAddress(address, DOGECOIN_VERSIONS)

export const validateZcashAddress = (address: string): boolean =>
  isValidBase58CheckAddress(address, ZCASH_VERSIONS) ||
  isValidBech32Address(address, ['zs', 'ztestsapling', 'zregtestsapling', 'u', 'utest', 'uregtest', 'tex', 'textest'])
