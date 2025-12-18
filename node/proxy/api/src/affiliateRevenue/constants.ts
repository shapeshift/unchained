export const NATIVE_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
export const DAO_TREASURY_ETHEREUM = '0x90a48d5cf7343b08da12e067680b4c6dbfe551be'
export const DAO_TREASURY_OPTIMISM = '0x6268d07327f4fb7380732dc6d63d95F88c0E083b'
export const DAO_TREASURY_AVALANCHE = '0x74d63F31C2335b5b3BA7ad2812357672b2624cEd'
export const DAO_TREASURY_POLYGON = '0xB5F944600785724e31Edb90F9DFa16dBF01Af000'
export const DAO_TREASURY_GNOSIS = '0xb0E3175341794D1dc8E5F02a02F9D26989EbedB3'
export const DAO_TREASURY_BSC = '0x8b92b1698b57bEDF2142297e9397875ADBb2297E'
export const DAO_TREASURY_ARBITRUM = '0x38276553F8fbf2A027D901F8be45f00373d8Dd48'
export const DAO_TREASURY_BASE = '0x9c9aA90363630d4ab1D9dbF416cc3BBC8d3Ed502'

// CAIP-2 Chain IDs (non-EVM chains that need explicit mapping)
export const BITCOIN_CHAIN_ID = 'bip122:000000000019d6689c085ae165831e93'
export const DOGECOIN_CHAIN_ID = 'bip122:00000000001a91e3dace36e2be3bf030'
export const ZCASH_CHAIN_ID = 'bip122:00040fe8ec8471911baa1db1266ea15d'
export const SOLANA_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
export const TRON_CHAIN_ID = 'tron:0x2b6653dc'
export const SUI_CHAIN_ID = 'sui:35834a8a'
export const THORCHAIN_CHAIN_ID = 'cosmos:thorchain-1'
export const MAYACHAIN_CHAIN_ID = 'cosmos:mayachain-mainnet-v1'

// Slip44 coin type values for native assets
export const SLIP44 = {
  BITCOIN: 0,
  DOGECOIN: 3,
  ETHEREUM: 60,
  ZCASH: 133,
  TRON: 195,
  SOLANA: 501,
  SUI: 784,
  THORCHAIN: 931,
  MAYACHAIN: 931,
} as const
