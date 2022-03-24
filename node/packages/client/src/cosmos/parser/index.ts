import { BigNumber } from 'bignumber.js'
import { caip2, caip19, AssetNamespace, AssetReference, CAIP2, CAIP19 } from '@shapeshiftoss/caip'
import { Status, TransferType } from '../../types'
import { aggregateTransfer } from '../../utils'
import { Tx as CosmosTx } from '../index'
import { ParsedTx } from '../types'
import { metaData } from './utils'

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
    }

    const msg = tx.messages[0]
    const events = tx.events[0]

    if (!msg) return parsedTx

    parsedTx.data = metaData(msg, events, this.assetId)

    // fall back on metaData value if it isn't found in the message (ie. withdraw_delegator_reward)
    const value = new BigNumber(msg.value?.amount || parsedTx.data?.value || 0)
    if (msg.from === address) {
      if (value.gt(0)) {
        parsedTx.transfers = aggregateTransfer(
          parsedTx.transfers,
          TransferType.Send,
          this.assetId,
          msg.from ?? '',
          msg.to ?? '',
          value.toString(10)
        )
      }
    }

    if (msg.to === address) {
      if (value.gt(0)) {
        parsedTx.transfers = aggregateTransfer(
          parsedTx.transfers,
          TransferType.Receive,
          this.assetId,
          msg.from ?? '',
          msg.to ?? '',
          value.toString(10)
        )
      }
    }

    // We use origin for fees because some txs have a different from and origin addresses
    if (msg.origin === address) {
      // network fee
      const fees = new BigNumber(tx.fee.amount)
      if (fees.gt(0)) {
        parsedTx.fee = { caip19: this.assetId, value: fees.toString(10) }
      }
    }

    return parsedTx
  }
}
