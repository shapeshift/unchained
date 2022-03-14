import { BigNumber } from 'bignumber.js'
import { caip2, caip19, AssetNamespace, AssetReference, CAIP2, CAIP19 } from '@shapeshiftoss/caip'
import { Tx as ParsedTx, Status, TransferType } from '../../types'
import { aggregateTransfer } from '../../utils'
import { Tx as CosmosTx } from '../index'

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
    const blockHeight = Number(tx.blockHeight)
    const blockTime = Number(tx.timestamp)

    const parsedTx: ParsedTx = {
      address,
      blockHash: tx.blockHash,
      blockHeight: isNaN(blockHeight) ? -1 : blockHeight,
      blockTime: isNaN(blockTime) ? -1 : blockTime,
      caip2: this.chainId,
      confirmations: -1, // TODO: confirmations not tracked by cosmos coinstack
      status: Status.Confirmed, // no mempool provided by cosmos coinstack currently, and can be inferred from confirmations when added
      transfers: [],
      txid: tx.txid,
      value: tx.value,
    }

    // messages make best attempt to track where value is transferring to for a variety of tx types
    // logs provide more specific information if needed as more complex tx types are added
    tx.messages?.forEach((msg) => {

      // Not a message we care about
      if(address !== msg.from && msg.from !== msg.to)
        return

      const value = new BigNumber(msg.value?.amount ?? 0).toString(10)
      const type = msg.from === address ? TransferType.Send : TransferType.Receive
      const caip19 = this.assetId
      const from = msg.from ?? ''
      const to = msg.to ?? ''

      parsedTx.transfers = [...parsedTx.transfers, { type, caip19, from, to, totalValue: value, components: [{ value }] }]
      
      const fees = new BigNumber(tx.fee.amount ?? 0)
      parsedTx.fee = { caip19: this.assetId, value: fees.toString(10) }
    })

    return parsedTx
  }
}
