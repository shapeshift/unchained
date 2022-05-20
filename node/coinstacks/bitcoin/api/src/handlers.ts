import { Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import { BitcoinTx } from './models'

export const handleTransaction = (tx: BlockbookTx): BitcoinTx => ({
  txid: tx.txid,
  blockHash: tx.blockHash,
  blockHeight: tx.blockHeight,
  timestamp: tx.blockTime,
  confirmations: tx.confirmations,
  value: tx.value,
  fee: tx.fees ?? '0',
  hex: tx.hex ?? '',
  vin: tx.vin.map((vin) => ({
    txid: vin.txid ?? '',
    vout: vin.vout?.toString() ?? '',
    sequence: vin.sequence,
    coinbase: vin.coinbase,
    scriptSig: {
      asm: vin.asm,
      hex: vin.hex,
    },
    addresses: vin.addresses ?? [],
  })),
  vout: tx.vout.map((vout) => ({
    value: vout.value ?? 0,
    n: vout.n,
    scriptPubKey: {
      asm: vout.asm,
      hex: vout.hex,
      type: vout.type,
      addresses: vout.addresses ?? [],
    },
  })),
})
