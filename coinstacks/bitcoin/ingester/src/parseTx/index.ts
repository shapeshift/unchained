import { BigNumber } from 'bignumber.js'
import { Tx } from '@shapeshiftoss/blockbook'
import { TxTransfer } from '@shapeshiftoss/common-ingester'
import { BTCParseTx } from '../types'

// keep track of all individual tx components and add up the total value transferred
const aggregateTransfer = (transfer: TxTransfer, value: string): TxTransfer => {
  if (transfer) {
    transfer.totalValue = new BigNumber(transfer.totalValue).plus(new BigNumber(value)).toString(10)
    transfer.components.push({ value: value })
  } else {
    transfer = { totalValue: value, components: [{ value: value }] }
  }

  return transfer
}

export const parseTx = async (tx: Tx, address: string): Promise<BTCParseTx> => {
  const pTx: BTCParseTx = {
    ...tx,
    address,
    receive: {},
    send: {},
  }

  tx.vin.forEach((vin) => {
    if (vin.isAddress === true && vin.addresses?.includes(address)) {
      // send amount
      const sendValue = new BigNumber(vin.value ?? 0)
      if (!sendValue.isNaN() && sendValue.gt(0)) {
        pTx.send['BTC'] = aggregateTransfer(pTx.send['BTC'], sendValue.toString(10))
      }

      // network fee
      const fees = new BigNumber(tx.fees ?? 0)
      if (!fees.isNaN() && fees.gt(0)) {
        pTx.fee = { symbol: 'BTC', value: fees.toString(10) }
      }
    }
  })

  tx.vout.forEach((vout) => {
    if (vout.isAddress === true && vout.addresses?.includes(address)) {
      // receive amount
      const receiveValue = new BigNumber(vout.value ?? 0)
      if (!receiveValue.isNaN() && receiveValue.gt(0)) {
        pTx.receive['BTC'] = aggregateTransfer(pTx.receive['BTC'], receiveValue.toString(10))
      }
    }
  })

  return pTx
}
