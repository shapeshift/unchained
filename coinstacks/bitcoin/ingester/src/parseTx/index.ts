import { BigNumber } from 'bignumber.js'
import { Tx, Vin, Vout } from '@shapeshiftoss/blockbook'
import { TxTransfer, Token } from '@shapeshiftoss/common-ingester'
import { BTCParseTx } from '../types'

const COINSTACK = process.env.COINSTACK
const NETWORK = 'MAINNET' //process.env.NETWORK

if (!COINSTACK) throw new Error('COINSTACK env var not set')
if (!NETWORK) throw new Error('NETWORK env var not set')

const nativeToken = `${COINSTACK}_${NETWORK}`

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

  // get send amount
  tx.vin.forEach((vin: Vin) => {
    if (vin.isAddress === true && vin.addresses?.includes(pTx.address)) {
      const sendValue = new BigNumber(vin.value ?? 0)
      if (!sendValue.isNaN() && sendValue.gt(0)) {
        pTx.send[nativeToken] = aggregateTransfer(pTx.send[nativeToken], vin.value ?? '0')

        // network fee (only for sends)
        const fees = new BigNumber(tx.fees ?? 0)
        if (tx.fees && !fees.isNaN() && fees.gt(0)) {
          pTx.fee = { assetId: nativeToken, value: tx.fees }
        }
      }
    }
  })

  // get receive amount
  tx.vout.forEach((vout: Vout) => {
    if (vout.isAddress === true && vout.addresses?.includes(pTx.address)) {
      const receiveValue = new BigNumber(vout.value ?? 0)
      if (!receiveValue.isNaN() && receiveValue.gt(0)) {
        pTx.receive[nativeToken] = aggregateTransfer(pTx.receive[nativeToken], vout.value ?? '0')
      }
    }
  })

  return pTx
}
