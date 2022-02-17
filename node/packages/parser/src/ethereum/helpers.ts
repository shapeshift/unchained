import { Tx } from '@shapeshiftoss/blockbook'
import { TransferType, Tx as ParseTx } from '../types'

export const txInteractsWithContract = (tx: Tx, contract: string) => {
  const receiveAddress = tx.vout[0].addresses?.[0] ?? ''
  return receiveAddress === contract
}

export const getStandardTx = (tx: ParseTx | undefined) => (tx?.transfers?.length === 1 ? tx.transfers[0] : undefined)

export const getBuyTx = (tx: ParseTx | undefined) =>
  tx?.trade ? tx.transfers?.find((t) => t.type === TransferType.Receive) : undefined

export const getSellTx = (tx: ParseTx | undefined) => {
  return tx?.trade ? tx.transfers?.find((t) => t.type === TransferType.Send) : undefined
}
