import { bech32 } from 'bech32'
import { Blockbook } from '@shapeshiftoss/blockbook'
import { Service } from '../../../common/api/src/utxo/service'
import { UTXO } from '../../../common/api/src/utxo/controller'
import { Logger } from '@shapeshiftoss/logger'

const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const INDEXER_API_KEY = process.env.INDEXER_API_KEY
const RPC_URL = process.env.RPC_URL
const RPC_API_KEY = process.env.RPC_API_KEY

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')

const IS_LIQUIFY = RPC_URL.toLowerCase().includes('liquify') && INDEXER_URL.toLowerCase().includes('liquify')
const IS_NOWNODES = RPC_URL.toLowerCase().includes('nownodes') && INDEXER_URL.toLowerCase().includes('nownodes')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'bitcoin', 'api'],
  level: process.env.LOG_LEVEL,
})

const httpURL = INDEXER_API_KEY && IS_LIQUIFY ? `${INDEXER_URL}/api=${INDEXER_API_KEY}` : INDEXER_URL
const wsURL = INDEXER_API_KEY && IS_LIQUIFY ? `${INDEXER_WS_URL}/api=${INDEXER_API_KEY}` : INDEXER_WS_URL
const rpcUrl = RPC_API_KEY && IS_LIQUIFY ? `${RPC_URL}/api=${RPC_API_KEY}` : RPC_URL

const apiKey = INDEXER_API_KEY && IS_NOWNODES ? INDEXER_API_KEY : undefined
const rpcApiKey = RPC_API_KEY && IS_NOWNODES ? RPC_API_KEY : undefined

const blockbook = new Blockbook({ httpURL, wsURL, logger, apiKey })

const isXpub = (pubkey: string): boolean => {
  return pubkey.startsWith('xpub') || pubkey.startsWith('ypub') || pubkey.startsWith('zpub')
}

export const formatAddress = (address: string): string => {
  if (bech32.decodeUnsafe(address.toLowerCase())?.prefix === 'bc') return address.toLowerCase()

  return address
}

export const service = new Service({
  blockbook,
  rpcUrl,
  isXpub,
  addressFormatter: formatAddress,
  rpcApiKey,
})

// assign service to be used for all instances of UTXO
UTXO.service = service
