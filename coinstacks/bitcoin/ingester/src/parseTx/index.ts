import { BigNumber } from 'bignumber.js'
import { Tx, Vin, Vout } from '@shapeshiftoss/blockbook'
import { ParseTx, TxTransfer, Token } from '@shapeshiftoss/common-ingester'

// keep track of all individual tx components and add up the total value transferred
const aggregateTransfer = (transfer: TxTransfer, value: string, token?: Token): TxTransfer => {
  if (transfer) {
    transfer.totalValue = new BigNumber(transfer.totalValue).plus(new BigNumber(value)).toString(10)
    transfer.components.push({ value: value })
  } else {
    transfer = { totalValue: value, components: [{ value: value }] }
  }

  return { ...transfer, token }
}

export const parseTx = async (tx: Tx, address: string): Promise<ParseTx> => {
  const sendAddresses: Array<string> = []
  tx.vin.forEach((vin: Vin) => {
    if (vin.isAddress === true) {
      // isAddress is false for coinbase and op return
      vin.addresses?.forEach((address: string) => address && sendAddresses.push(address))
    }
  })

  const receiveAddresses: Array<string> = []
  tx.vout.forEach((vout: Vout) => {
    if (vout.isAddress === true) {
      vout.addresses?.forEach((address: string) => address && receiveAddresses.push(address))
    }
  })

  const pTx: ParseTx = {
    ...tx,
    address,
    receive: {},
    send: {},
  }

  // todo - assumption - single input
  // get send amount
  if (sendAddresses.includes(pTx.address)) {
    const sendValue = new BigNumber(tx.value)
    if (!sendValue.isNaN() && sendValue.gt(0)) {
      pTx.send['BTC'] = aggregateTransfer(pTx.send['BTC'], tx.value)
    }

    // network fee
    const fees = new BigNumber(tx.fees ?? 0)
    if (tx.fees && !fees.isNaN() && fees.gt(0)) {
      pTx.fee = { symbol: 'BTC', value: tx.fees }
    }
  }

  // get receive amount
  if (receiveAddresses.includes(pTx.address)) {
    // receive amount
    const receiveValue = new BigNumber(tx.value)
    if (!receiveValue.isNaN() && receiveValue.gt(0)) {
      pTx.receive['BTC'] = aggregateTransfer(pTx.receive['BTC'], tx.value)
    }
  }

  return pTx
}
