import { Tx } from '@shapeshiftoss/blockbook'

export const mempoolMock = (tx: Tx, tokenTransfers = false) => {
  const ethereumSpecificOverride = { status: -1, gasUsed: null }
  const mempoolSpecific = {
    blockHeight: -1,
    confirmations: 0,
    fees: '0',
    blockHash: undefined,
    rbf: true,
    tokenTransfers: tokenTransfers ? tx.tokenTransfers : [],
    ethereumSpecific: Object.assign({}, tx.ethereumSpecific, ethereumSpecificOverride),
  }
  return Object.assign({}, tx, mempoolSpecific)
}
