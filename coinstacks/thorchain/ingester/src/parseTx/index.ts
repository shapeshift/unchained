import { Tx } from '@shapeshiftoss/blockbook'
import { THORParseTx } from '../types'

export const parseTx = async (tx: Tx, address: string): Promise<THORParseTx> => {
  const pTx: THORParseTx = {
    ...tx,
    address,
    receive: {},
    send: {},
  }

  return pTx
}
