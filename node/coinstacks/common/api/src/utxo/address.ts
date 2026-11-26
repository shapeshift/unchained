import { createHash } from 'crypto'
import { bech32, bech32m } from 'bech32'

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE58_MAP = new Map(Array.from(BASE58_ALPHABET).map((char, i) => [char, BigInt(i)]))

// bech32 limits addresses to 90 characters, but zcash shielded and unified addresses are longer
const BECH32_LIMIT = 1023

const sha256 = (data: Buffer): Buffer => createHash('sha256').update(data).digest()

const base58Decode = (str: string): Buffer | undefined => {
  if (!str) return

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
 * Validate a base58check encoded address (legacy P2PKH/P2SH, zcash transparent addresses, extended public keys)
 */
export const isValidBase58CheckAddress = (address: string): boolean => {
  const decoded = base58Decode(address)

  // smallest valid payload is a 1 byte version + 20 byte hash
  if (!decoded || decoded.length < 21 + 4) return false

  const payload = decoded.subarray(0, -4)
  const checksum = decoded.subarray(-4)

  return sha256(sha256(payload)).subarray(0, 4).equals(checksum)
}

/**
 * Validate a bech32 or bech32m encoded address with one of the expected human readable prefixes
 */
export const isValidBech32Address = (address: string, prefixes: Array<string>): boolean => {
  const decoded = bech32.decodeUnsafe(address, BECH32_LIMIT) ?? bech32m.decodeUnsafe(address, BECH32_LIMIT)
  return !!decoded && prefixes.includes(decoded.prefix)
}

const CASHADDR_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const CASHADDR_GENERATORS = [
  BigInt('0x98f2bc8e61'),
  BigInt('0x79b76d99e2'),
  BigInt('0xf33e5fb3c4'),
  BigInt('0xae2eabe2a8'),
  BigInt('0x1e4f43e470'),
]

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
  if (payload.length < 42) return false

  const data: Array<number> = []
  for (const char of payload) {
    const value = CASHADDR_CHARSET.indexOf(char)
    if (value === -1) return false
    data.push(value)
  }

  const prefixData = Array.from(prefix).map((char) => char.charCodeAt(0) & 0x1f)

  return cashaddrPolymod([...prefixData, 0, ...data]) === BigInt(0)
}

export const validateBitcoinAddress = (address: string): boolean =>
  isValidBase58CheckAddress(address) || isValidBech32Address(address, ['bc', 'tb', 'bcrt'])

export const validateLitecoinAddress = (address: string): boolean =>
  isValidBase58CheckAddress(address) || isValidBech32Address(address, ['ltc', 'tltc', 'rltc'])

export const validateBitcoinCashAddress = (address: string): boolean =>
  isValidBase58CheckAddress(address) || isValidCashAddrAddress(address, ['bitcoincash', 'bchtest', 'bchreg'])

export const validateDogecoinAddress = (address: string): boolean => isValidBase58CheckAddress(address)

export const validateZcashAddress = (address: string): boolean =>
  isValidBase58CheckAddress(address) ||
  isValidBech32Address(address, ['zs', 'ztestsapling', 'zregtestsapling', 'u', 'utest', 'uregtest', 'tex', 'textest'])
