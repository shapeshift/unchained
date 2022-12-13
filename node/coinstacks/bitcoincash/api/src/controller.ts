import { bech32 } from 'bech32'
import { Blockbook } from '@shapeshiftoss/blockbook'
import { Service } from '../../../common/api/src/utxo/service'
import { UTXO } from '../../../common/api/src/utxo/controller'

const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const RPC_URL = process.env.RPC_URL

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')

const blockbook = new Blockbook({ httpURL: INDEXER_URL, wsURL: INDEXER_WS_URL })

const isXpub = (pubkey: string): boolean => {
  return pubkey.startsWith('xpub') || pubkey.startsWith('ypub') || pubkey.startsWith('zpub')
}

export const formatAddress = (address: string): string => {
  // Bitcoin Cash addresses can actually be prefixed with the network and still be addresses as part of the CashAddr spec
  // These look just like your regular URIs, prefixed with the network
  // but are different from `bitcoin:`, `litecoin:` etc prefixed strings, which are actually BIP-21 URIs, see:
  // Bitcoin BIP21 URIs: https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki#abnf-grammar
  // Bitcoin Cash CashAddr addresses: https://reference.cash/protocol/blockchain/encoding/cashaddr
  if (address.startsWith('bitcoincash') || bech32.decodeUnsafe(address.toLowerCase())?.prefix === 'bc')
    return address.toLowerCase()

  // Slap the prefix in if it isn't present, blockbook only understands prefixed CashAddrs
  // https://github.com/bitcoincashorg/bitcoincash.org/blob/master/spec/cashaddr.md#prefix
  if (address.startsWith('q')) return `bitcoincash:${address.toLowerCase()}`

  return address
}

export const service = new Service({ addressFormatter: formatAddress, blockbook, rpcUrl: RPC_URL, isXpub })

// assign service to be used for all instances of UTXO
UTXO.service = service
