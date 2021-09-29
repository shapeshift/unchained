import { BigNumber } from 'bignumber.js'
import { Tx, Vin, Vout } from '@shapeshiftoss/blockbook'
import { TxTransfer, Token, TxFee } from '@shapeshiftoss/common-ingester'
import { BTCParseTx } from '../types'

const NODE_ENV = process.env.NODE_ENV
const COINSTACK = process.env.COINSTACK
const NETWORK = process.env.NETWORK

if (NODE_ENV !== 'test') {
  if (!COINSTACK) throw new Error('COINSTACK env var not set')
  if (!NETWORK) throw new Error('NETWORK env var not set')
}

const nativeAssetId = `${COINSTACK}_${NETWORK}`

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

export const parseTx = async (tx: Tx, address: string): Promise<BTCParseTx> => {
  const pTx: BTCParseTx = {
    ...tx,
    address,
    receive: {},
    send: {},
  }

  tx.vin.forEach((vin: Vin) => {
    if (vin.isAddress === true && vin.addresses?.includes(address)) {
      // send amount
      const sendValue = new BigNumber(vin.value ?? 0)
      if (!sendValue.isNaN() && sendValue.gt(0)) {
        pTx.send['BTC'] = aggregateTransfer(pTx.send['BTC'], sendValue.toString(10))

        // network fee (only for sends)
        const fees = new BigNumber(tx.fees ?? 0)
        if (!fees.isNaN() && fees.gt(0)) {
          pTx.fee = { symbol: 'BTC', value: fees.toString(10) }
        }
      }
    }
  })

  tx.vout.forEach((vout: Vout) => {
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
