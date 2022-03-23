import { BigNumber } from 'bignumber.js'
import { caip2, caip19, AssetNamespace, AssetReference, CAIP2, CAIP19 } from '@shapeshiftoss/caip'
import { Status, TransferType } from '../../types'
import { aggregateTransfer } from '../../utils'
import { Tx as CosmosTx } from '../index'
import { ParsedTx } from '../types'

export interface TransactionParserArgs {
  chainId: CAIP2
}

export class TransactionParser {
  chainId: CAIP2
  assetId: CAIP19

  constructor(args: TransactionParserArgs) {
    this.chainId = args.chainId

    this.assetId = caip19.toCAIP19({
      ...caip2.fromCAIP2(this.chainId),
      assetNamespace: AssetNamespace.Slip44,
      assetReference: AssetReference.Cosmos,
    })
  }

  async parse(tx: CosmosTx, address: string): Promise<ParsedTx> {
    const parsedTx: ParsedTx = {
      address,
      blockHash: tx.blockHash,
      blockHeight: tx.blockHeight ?? -1,
      blockTime: tx.timestamp ?? Math.floor(Date.now() / 1000),
      caip2: this.chainId,
      confirmations: tx.confirmations,
      status: tx.confirmations > 0 ? Status.Confirmed : Status.Pending, // TODO: handle failed case
      transfers: [],
      txid: tx.txid,
      value: tx.value,
    }

    // messages make best attempt to track where value is transferring to for a variety of tx types
    // logs provide more specific information if needed as more complex tx types are added
    tx.messages.forEach((msg) => {
      if (msg.from === address) {
        // send amount
        const sendValue = new BigNumber(msg.value?.amount ?? 0)
        if (sendValue.gt(0)) {
          parsedTx.transfers = aggregateTransfer(
            parsedTx.transfers,
            TransferType.Send,
            this.assetId,
            msg.from ?? '',
            msg.to ?? '',
            sendValue.toString(10)
          )
        }

        // network fee
        const fees = new BigNumber(tx.fee.amount)
        if (fees.gt(0)) {
          parsedTx.fee = { caip19: this.assetId, value: fees.toString(10) }
        }
      }

      if (msg.to === address) {
        // receive amount
        const receiveValue = new BigNumber(msg.value?.amount ?? 0)
        if (receiveValue.gt(0)) {
          parsedTx.transfers = aggregateTransfer(
            parsedTx.transfers,
            TransferType.Receive,
            this.assetId,
            msg.from ?? '',
            msg.to ?? '',
            receiveValue.toString(10)
          )
        }
      }
    })

    return parsedTx
  }
}
