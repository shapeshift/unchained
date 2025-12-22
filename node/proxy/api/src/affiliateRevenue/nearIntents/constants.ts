import {
  BITCOIN_CHAIN_ID,
  DOGECOIN_CHAIN_ID,
  SLIP44,
  SOLANA_CHAIN_ID,
  SUI_CHAIN_ID,
  TRON_CHAIN_ID,
  ZCASH_CHAIN_ID,
} from '../constants'

export const NEAR_INTENTS_API_KEY = process.env.NEAR_INTENTS_API_KEY
export const FEE_BPS_DENOMINATOR = 10000

if (!NEAR_INTENTS_API_KEY) throw new Error('NEAR_INTENTS_API_KEY env var not set')

export const NEAR_INTENTS_TO_CHAIN_ID: Record<string, string> = {
  eth: 'eip155:1',
  arb: 'eip155:42161',
  base: 'eip155:8453',
  gnosis: 'eip155:100',
  bsc: 'eip155:56',
  pol: 'eip155:137',
  avax: 'eip155:43114',
  op: 'eip155:10',
  btc: BITCOIN_CHAIN_ID,
  doge: DOGECOIN_CHAIN_ID,
  zec: ZCASH_CHAIN_ID,
  sol: SOLANA_CHAIN_ID,
  tron: TRON_CHAIN_ID,
  sui: SUI_CHAIN_ID,
  monad: 'eip155:143',
}

export const SLIP44_BY_NETWORK: Record<string, number> = {
  btc: SLIP44.BITCOIN,
  doge: SLIP44.DOGECOIN,
  zec: SLIP44.ZCASH,
  sol: SLIP44.SOLANA,
  tron: SLIP44.TRON,
  sui: SLIP44.SUI,
}
