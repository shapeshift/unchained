import { BigNumber } from 'bignumber.js'
import { caip2, caip19, AssetNamespace, AssetReference, CAIP2, CAIP19 } from '@shapeshiftoss/caip'
import { Status, TransferType } from '../../types'
import { Tx as CosmosTx } from '../index'
import { ParsedTx } from '../types'
import { valuesFromMsgEvents } from './utils'

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
      chainId: this.chainId,
      confirmations: tx.confirmations,
      status: tx.confirmations > 0 ? Status.Confirmed : Status.Pending, // TODO: handle failed case
      transfers: [],
      txid: tx.txid,
    }

    // For simplicity and to limit scope we assume 1 message per transaction
    // This works ok enough for transactions we generate but way may want to improve in the future
    const { from, to, data, value, origin } = valuesFromMsgEvents(tx.messages[0], tx.events, this.assetId)

    parsedTx.data = data

    if (from === address || to === address) {
      if (value.gt(0)) {
        parsedTx.transfers = [
          {
            type: from === address ? TransferType.Send : TransferType.Receive,
            caip19: this.assetId,
            assetId: this.assetId,
            from,
            to,
            totalValue: value.toString(10),
            components: [{ value: value.toString(10) }],
          },
        ]
      }
    }

    // We use origin for fees because some txs have a different from and origin addresses
    if (origin === address) {
      // network fee
      const fees = new BigNumber(tx.fee.amount)
      if (fees.gt(0)) {
        parsedTx.fee = { caip19: this.assetId, assetId: this.assetId, value: fees.toString(10) }
      }
    }

    return parsedTx
  }
}
