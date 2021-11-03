import { BigNumber } from 'bignumber.js'
import { Tx } from '@shapeshiftoss/blockbook'
import { ParseTx, ParseTxUnique, Token, TransferType, TxTransfer } from '../types'
import { InternalTx } from './types'
import { getSigHash } from './utils'
import * as multiSig from './multiSig'
import * as thor from './thor'
import * as uniV2 from './uniV2'
import * as zrx from './zrx'

// return any addresses that can be detected
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

// keep track of all individual tx components and add up the total value transferred by to/from address
const aggregateTransfer = (
  transfers: Array<TxTransfer>,
  type: TransferType,
  symbol: string,
  from: string,
  to: string,
  value: string,
  token?: Token
): Array<TxTransfer> => {
  const index = transfers?.findIndex((t) => t.type === type && t.symbol === symbol && t.from === from && t.to === to)
  const transfer = transfers?.[index]

  if (transfer) {
    transfer.totalValue = new BigNumber(transfer.totalValue).plus(new BigNumber(value)).toString(10)
    transfer.components.push({ value: value })
    transfers[index] = transfer
  } else {
    transfers = [...transfers, { type, symbol, from, to, totalValue: value, components: [{ value: value }], token }]
  }

  return transfers
}

export enum Network {
  Mainnet = 'mainnet',
  Ropsten = 'ropsten',
}

export interface TransactionParserArgs {
  network?: Network
  midgardUrl: string
  rpcUrl: string
}

export class TransactionParser {
  midgardUrl: string
  rpcUrl: string
  network: Network

  constructor(args: TransactionParserArgs) {
    this.midgardUrl = args.midgardUrl
    this.rpcUrl = args.rpcUrl
    this.network = args.network ?? Network.Mainnet
  }
}

export const parseTx = async (tx: Tx, address: string, internalTxs?: Array<InternalTx>): Promise<ParseTx> => {
  const sendAddress = tx.vin[0].addresses?.[0] ?? ''
  const receiveAddress = tx.vout[0].addresses?.[0] ?? ''

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

  const pTx: ParseTx = {
    address,
    txid: tx.txid,
    blockHash: tx.blockHash,
    blockHeight: tx.blockHeight,
    blockTime: tx.blockTime,
    transfers: result?.transfers ?? [],
    refund: result?.refund,
    trade: result?.trade,
  }

  if (address === sendAddress) {
    // send amount
    const sendValue = new BigNumber(tx.value)
    if (!sendValue.isNaN() && sendValue.gt(0)) {
      pTx.transfers = aggregateTransfer(
        pTx.transfers,
        TransferType.Send,
        'ETH',
        sendAddress,
        receiveAddress,
        sendValue.toString(10)
      )
    }

    // network fee
    const fees = new BigNumber(tx.fees ?? 0)
    if (!fees.isNaN() && fees.gt(0)) {
      pTx.fee = { symbol: 'ETH', value: fees.toString(10) }
    }
  }

  if (address === receiveAddress) {
    // receive amount
    const receiveValue = new BigNumber(tx.value)
    if (!receiveValue.isNaN() && receiveValue.gt(0)) {
      pTx.transfers = aggregateTransfer(
        pTx.transfers,
        TransferType.Receive,
        'ETH',
        sendAddress,
        receiveAddress,
        receiveValue.toString(10)
      )
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

    const transferArgs = [transfer.symbol, transfer.from, transfer.to, transfer.value, token] as const

    // token send amount
    if (address === transfer.from) {
      pTx.transfers = aggregateTransfer(pTx.transfers, TransferType.Send, ...transferArgs)
    }

    // token receive amount
    if (address === transfer.to) {
      pTx.transfers = aggregateTransfer(pTx.transfers, TransferType.Receive, ...transferArgs)
    }
  })

  internalTxs?.forEach((internalTx) => {
    const transferArgs = ['ETH', internalTx.from, internalTx.to, internalTx.value] as const

    // internal eth send
    if (address === internalTx.from) {
      pTx.transfers = aggregateTransfer(pTx.transfers, TransferType.Send, ...transferArgs)
    }

    // internal eth receive
    if (address === internalTx.to) {
      pTx.transfers = aggregateTransfer(pTx.transfers, TransferType.Receive, ...transferArgs)
    }
  })

  return pTx
}
