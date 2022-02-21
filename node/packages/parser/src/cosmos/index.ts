import { BigNumber } from 'bignumber.js'
import { caip2, caip19 } from '@shapeshiftoss/caip'
import { ChainTypes } from '@shapeshiftoss/types'
import { Tx as ParseTx, Status, TransferType } from '../types'
import { aggregateTransfer } from '../utils'
import { Tx, Network } from './types'
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
    const caip19Cosmos = caip19.toCAIP19({ chain: ChainTypes.Cosmos, network: toNetworkType(this.network) })

    const blockHeight = Number(tx.blockHeight)
    const blockTime = Number(tx.timestamp)

    const parsedTx: ParseTx = {
      address,
      blockHash: tx.blockHash,
      blockHeight: isNaN(blockHeight) ? -1 : blockHeight,
      blockTime: isNaN(blockTime) ? -1 : blockTime,
      caip2: caip2.toCAIP2({ chain: ChainTypes.Cosmos, network: toNetworkType(this.network) }),
      confirmations: -1, // TODO: confirmations not tracked by cosmos coinstack
      status: Status.Confirmed, // no mempool provided by cosmos coinstack currently, and can be inferred from confirmations when added
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
            caip19Cosmos,
            msg.from ?? '',
            msg.to ?? '',
            sendValue.toString(10)
          )
        }

        // network fee
        const fees = new BigNumber(tx.fee.amount)
        if (fees.gt(0)) {
          parsedTx.fee = { caip19: caip19Cosmos, value: fees.toString(10) }
        }
      }

      if (msg.to === address) {
        // receive amount
        const receiveValue = new BigNumber(msg.value?.amount ?? 0)
        if (receiveValue.gt(0)) {
          parsedTx.transfers = aggregateTransfer(
            parsedTx.transfers,
            TransferType.Receive,
            caip19Cosmos,
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
