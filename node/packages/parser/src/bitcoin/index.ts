import { BigNumber } from 'bignumber.js'
import { Tx } from '@shapeshiftoss/blockbook'
import { caip2, caip19 } from '@shapeshiftoss/caip'
import { ChainTypes } from '@shapeshiftoss/types'
import { Tx as ParseTx, Status, TransferType, Transfer } from '../types'
import { Network } from './types'
import { toNetworkType } from './utils'

export * from './types'

export interface TransactionParserArgs {
  network?: Network
  rpcUrl: string
}

export class TransactionParser {
  network: Network

  constructor(args: TransactionParserArgs) {
    this.network = args.network ?? 'mainnet'
  }

  async parse(tx: Tx, address: string): Promise<ParseTx> {
    const caip19BTC = caip19.toCAIP19({ chain: ChainTypes.Bitcoin, network: toNetworkType(this.network) })

    const pTx: ParseTx = {
      address,
      blockHash: tx.blockHash,
      blockHeight: tx.blockHeight,
      blockTime: tx.blockTime,
      caip2: caip2.toCAIP2({ chain: ChainTypes.Bitcoin, network: toNetworkType(this.network) }),
      confirmations: tx.confirmations,
      status: tx.confirmations > 0 ? Status.Confirmed : Status.Pending,
      transfers: [],
      txid: tx.txid,
      value: tx.value,
    }

    tx.vin.forEach((vin) => {
      if (vin.isAddress === true && vin.addresses?.includes(address)) {
        // send amount
        const sendValue = new BigNumber(vin.value ?? 0)
        if (sendValue.gt(0)) {
          pTx.transfers = this.aggregateTransfer(
            pTx.transfers,
            TransferType.Send,
            caip19BTC,
            vin.addresses?.[0] ?? '',
            tx.vout[0].addresses?.[0] ?? '',
            sendValue.toString(10)
          )
        }

        // network fee
        const fees = new BigNumber(tx.fees ?? 0)
        if (fees.gt(0)) {
          pTx.fee = { caip19: caip19BTC, value: fees.toString(10) }
        }
      }
    })

    tx.vout.forEach((vout) => {
      if (vout.isAddress === true && vout.addresses?.includes(address)) {
        // receive amount
        const receiveValue = new BigNumber(vout.value ?? 0)
        if (receiveValue.gt(0)) {
          pTx.transfers = this.aggregateTransfer(
            pTx.transfers,
            TransferType.Receive,
            caip19BTC,
            tx.vin[0].addresses?.[0] ?? '',
            vout.addresses?.[0] ?? '',
            receiveValue.toString(10)
          )
        }
      }
    })

    return pTx
  }

  // keep track of all individual tx components and add up the total value transferred
  private aggregateTransfer(
    transfers: Array<Transfer>,
    type: TransferType,
    caip19: string,
    from: string,
    to: string,
    value: string
  ): Array<Transfer> {
    if (!new BigNumber(value).gt(0)) return transfers

    const index = transfers?.findIndex((t) => t.type === type && t.caip19 === caip19 && t.from === from && t.to === to)
    const transfer = transfers?.[index]

    if (transfer) {
      transfer.totalValue = new BigNumber(transfer.totalValue).plus(value).toString(10)
      transfer.components.push({ value: value })
      transfers[index] = transfer
    } else {
      transfers = [...transfers, { type, caip19, from, to, totalValue: value, components: [{ value: value }] }]
    }

    return transfers
  }
}
