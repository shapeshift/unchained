import { BigNumber } from 'bignumber.js'
import { caip19, CAIP2 } from '@shapeshiftoss/caip'
import { cosmos } from '@shapeshiftoss/unchained-client'
import { Tx as ParseTx, Status, TransferType } from '../types'
import { aggregateTransfer } from '../utils'
import { ChainTypes, NetworkTypes } from '@shapeshiftoss/types'

export interface TransactionParserArgs {
  chainId: CAIP2
}

export class TransactionParser {
  chainId: CAIP2

  constructor(args: TransactionParserArgs) {
    this.chainId = args.chainId
  }

  async parse(tx: cosmos.Tx, address: string): Promise<ParseTx> {
    const caip19Cosmos = caip19.toCAIP19({ chain: ChainTypes.Cosmos, network: NetworkTypes.COSMOSHUB_MAINNET })

    const blockHeight = Number(tx.blockHeight)
    const blockTime = Number(tx.timestamp)

    const parsedTx: ParseTx = {
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
