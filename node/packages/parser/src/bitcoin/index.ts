import { BigNumber } from 'bignumber.js'
import { Tx } from '@shapeshiftoss/blockbook'
import { caip2, caip19, AssetNamespace, AssetReference } from '@shapeshiftoss/caip'
import { ChainTypes } from '@shapeshiftoss/types'
import { Tx as ParseTx, Status, TransferType } from '../types'
import { aggregateTransfer } from '../utils'
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
    const caip19Bitcoin = caip19.toCAIP19({
      chain: ChainTypes.Bitcoin,
      network: toNetworkType(this.network),
      assetNamespace: AssetNamespace.Slip44,
      assetReference: AssetReference.Bitcoin,
    })

    const parsedTx: ParseTx = {
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
          parsedTx.transfers = aggregateTransfer(
            parsedTx.transfers,
            TransferType.Send,
            caip19Bitcoin,
            vin.addresses?.[0] ?? '',
            tx.vout[0].addresses?.[0] ?? '',
            sendValue.toString(10)
          )
        }

        // network fee
        const fees = new BigNumber(tx.fees ?? 0)
        if (fees.gt(0)) {
          parsedTx.fee = { caip19: caip19Bitcoin, value: fees.toString(10) }
        }
      }
    })

    tx.vout.forEach((vout) => {
      if (vout.isAddress === true && vout.addresses?.includes(address)) {
        // receive amount
        const receiveValue = new BigNumber(vout.value ?? 0)
        if (receiveValue.gt(0)) {
          parsedTx.transfers = aggregateTransfer(
            parsedTx.transfers,
            TransferType.Receive,
            caip19Bitcoin,
            tx.vin[0].addresses?.[0] ?? '',
            vout.addresses?.[0] ?? '',
            receiveValue.toString(10)
          )
        }
      }
    })

    return parsedTx
  }
}
