import { BITCOIN_CHAIN_ID, SLIP44, SOLANA_CHAIN_ID, TRON_CHAIN_ID } from '../constants'

export const RELAY_API_URL = 'https://api.relay.link'
export const SHAPESHIFT_REFERRER = 'shapeshift'

export const NON_EVM_CHAINS: Record<number, { chainId: string; slip44: number }> = {
  792703809: { chainId: SOLANA_CHAIN_ID, slip44: SLIP44.SOLANA },
  8253038: { chainId: BITCOIN_CHAIN_ID, slip44: SLIP44.BITCOIN },
  728126428: { chainId: TRON_CHAIN_ID, slip44: SLIP44.TRON },
  9286185: { chainId: 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z', slip44: SLIP44.SOLANA },
  9286186: { chainId: 'solana:soon', slip44: SLIP44.SOLANA },
}
