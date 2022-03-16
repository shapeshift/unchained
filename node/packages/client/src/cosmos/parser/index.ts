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
            sendValue.toString(10),
            undefined,
            msg.type
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
            receiveValue.toString(10),
            undefined,
            msg.type
          )
        }
      }
    })

    return parsedTx
  }

  /**
   * Some message such as withdraw_delegator_reward have an empty value
   * This gets the value for a given message from events if possible
   * @param msg message with an empty value
   * @returns corresponding value from event logs
   */
  private valueFromEvents = (msg: any, events: any): string => {
    if (msg.type === 'withdraw_delegator_reward') {
      const validator = msg.to

      const rewardEvents = events.find((event: any) => event.type === 'withdraw_rewards')

      const rewardEvent = rewardEvents?.find((event: any) => {
        const attributes = event.attributes

        const attribute = attributes?.find(
          (attribute: any) => attribute.key === 'validator' && attribute.value === validator
        )

        return !!attribute
      })

      const valueUnparsed = rewardEvent?.attributes.find((attribute: any) => attribute.key === 'amount')?.value

      return '123'
    } else throw new Error('valueFromEvents unsupported message type')
  }
}
