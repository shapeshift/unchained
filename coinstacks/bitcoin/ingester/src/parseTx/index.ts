import { BigNumber } from 'bignumber.js'
import { Tx } from '@shapeshiftoss/blockbook'
import { ParseTxUnique, Token, TxTransfer } from '@shapeshiftoss/common-ingester'
import { ETHParseTx, InternalTx } from '../types'
import { getSigHash } from './utils'
import * as zrx from './zrx'
import * as thor from './thor'
import * as multiSig from './multiSig'
import * as uniV2 from './uniV2'

export const getInternalAddress = (inputData: string): string | undefined => {
  switch (getSigHash(inputData)) {
    case thor.TRANSFEROUT_SIG_HASH:
      return thor.getInternalAddress(inputData)
    case multiSig.SENDMULTISIG_SIG_HASH:
      return multiSig.getInternalAddress(inputData)
    default:
      return
  }
}

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

export const parseTx = async (tx: Tx, address: string, internalTxs?: Array<InternalTx>): Promise<ETHParseTx> => {
  const sendAddress = tx.vin[0].addresses?.[0]
  const receiveAddress = tx.vout[0].addresses?.[0]

  let result: ParseTxUnique | undefined
  switch (receiveAddress) {
    case zrx.PROXY_CONTRACT: {
      result = zrx.parse(tx, address, internalTxs)
      break
    }
    case thor.ROUTER_CONTRACT: {
      result = (await thor.parse(tx, address, internalTxs)) as ParseTxUnique | undefined
      break
    }
    case uniV2.ROUTER_CONTRACT: {
      result = (await uniV2.parse(tx)) as ParseTxUnique | undefined
      break
    }
  }

  const pTx: ETHParseTx = {
    ...tx,
    address,
    receive: {},
    send: result?.send ?? {},
    refund: result?.refund,
    trade: result?.trade,
  }

  if (address === sendAddress) {
    // eth send amount
    const sendValue = new BigNumber(tx.value)
    if (!sendValue.isNaN() && sendValue.gt(0)) {
      pTx.send['ETH'] = aggregateTransfer(pTx.send['ETH'], tx.value)
    }

    // eth network fee
    const fees = new BigNumber(tx.fees ?? 0)
    if (tx.fees && !fees.isNaN() && fees.gt(0)) {
      pTx.fee = { symbol: 'ETH', value: tx.fees }
    }
  }

  if (address === receiveAddress) {
    // eth receive amount
    const receiveValue = new BigNumber(tx.value)
    if (!receiveValue.isNaN() && receiveValue.gt(0)) {
      pTx.receive['ETH'] = aggregateTransfer(pTx.receive['ETH'], tx.value)
    }
  }

  tx.tokenTransfers?.forEach((transfer) => {
    // FTX Token (FTT) name and symbol was set backwards on the ERC20 contract
    if (transfer.token == '0x50D1c9771902476076eCFc8B2A83Ad6b9355a4c9') {
      transfer.name = transfer.symbol
      transfer.symbol = transfer.name
    }

    const token: Token = {
      contract: transfer.token,
      decimals: transfer.decimals,
      name: transfer.name,
    }

    // token send amount
    if (address === transfer.from) {
      pTx.send[transfer.symbol] = aggregateTransfer(pTx.send[transfer.symbol], transfer.value, token)
    }

    // token receive amount
    if (address === transfer.to) {
      pTx.receive[transfer.symbol] = aggregateTransfer(pTx.receive[transfer.symbol], transfer.value, token)
    }
  })

  internalTxs?.forEach((internalTx) => {
    // internal eth send
    if (address === internalTx.from) {
      pTx.send['ETH'] = aggregateTransfer(pTx.send['ETH'], internalTx.value)
    }

    // internal eth receive
    if (address === internalTx.to) {
      pTx.receive['ETH'] = aggregateTransfer(pTx.receive['ETH'], internalTx.value)
    }
  })

  return pTx
}
