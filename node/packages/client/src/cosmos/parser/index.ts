/* eslint-disable prettier/prettier */
import { BigNumber } from 'bignumber.js'
import { caip2, caip19, AssetNamespace, AssetReference, CAIP2, CAIP19 } from '@shapeshiftoss/caip'
import { Tx as ParsedTx, Status, TransferType } from '../../types'
import { aggregateTransfer } from '../../utils'
import { Tx as CosmosTx } from '../index'
import { valueFromEvents } from './utils'

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
    const msg = tx.messages[0]
    const msgEvents = tx.events[0]

    // Not all cosmos messages have a value on the message
    // for example `withdraw_delegator_reward` must look at events for value
    const value = new BigNumber(msg.value?.amount || valueFromEvents(msg, msgEvents) || 0).toString(10)

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
      value,
      data: {
        parser: 'cosmos',
        method: msg.type,
        extras: {
          from: msg.from,
          to: msg.to,
          caip19: this.assetId,
          value,
        },
      },
    }

    if (msg.from === address) {
      parsedTx.transfers = aggregateTransfer(
        parsedTx.transfers,
        TransferType.Send,
        this.assetId,
        msg.from ?? '',
        msg.to ?? '',
        value
      )
    }
    if (msg.to === address) {
      parsedTx.transfers = aggregateTransfer(
        parsedTx.transfers,
        TransferType.Receive,
        this.assetId,
        msg.from ?? '',
        msg.to ?? '',
        value
      )
    }
    // Fees applies to the original tx sender. msg.from is not a reliable indicator of original sender
    // For example with redelegate `from` is a validator (not sender)
    if (msg.to !== address) {
      const fees = new BigNumber(tx?.fee?.amount)
      if (fees.gt(0)) {
        parsedTx.fee = { caip19: this.assetId, value: fees.toString(10) }
      }
    }

    return parsedTx
  }
}
