import { Status, Tx, TransferType } from '../../../types'
import { TransactionParser } from '../index'
import standard from './mockData/standard'

const txParser = new TransactionParser({ chainId: 'cosmos:cosmoshub-4' })

describe('parseTx', () => {
  it.only('should be able to parse a standard send tx', async () => {
    const { tx } = standard
    const address = 'cosmos1t5u0jfg3ljsjrh2m9e47d4ny2hea7eehxrzdgd'

    const expected: Tx = {
      txid: tx.txid,
      blockHash: tx.blockHash,
      blockHeight: tx.blockHeight,
      blockTime: tx.timestamp,
      confirmations: tx.confirmations,
      status: Status.Confirmed,
      address: address,
      caip2: 'cosmos:cosmoshub-4',
      fee: {
        caip19: 'cosmos:cosmoshub-4/slip44:118',
        value: '2500',
      },
      transfers: [
        {
          type: TransferType.Send,
          from: address,
          to: 'cosmos14e25lpsedq863vgweqg4m9n0z28c203kfdlzmz',
          caip19: 'cosmos:cosmoshub-4/slip44:118',
          totalValue: '2002965',
          components: [{ value: '2002965' }],
        },
      ],
    }

    const actual = await txParser.parse(tx, address)

    expect(expected).toEqual(actual)
  })

  it('should be able to parse a standard receive tx', async () => {
    const { tx } = standard
    const address = 'cosmos14e25lpsedq863vgweqg4m9n0z28c203kfdlzmz'

    const expected: Tx = {
      txid: tx.txid,
      blockHash: tx.blockHash,
      blockHeight: tx.blockHeight,
      blockTime: tx.timestamp,
      confirmations: tx.confirmations,
      status: Status.Confirmed,
      address: address,
      caip2: 'cosmos:cosmoshub-4',
      transfers: [
        {
          type: TransferType.Receive,
          from: 'cosmos1t5u0jfg3ljsjrh2m9e47d4ny2hea7eehxrzdgd',
          to: address,
          caip19: 'cosmos:cosmoshub-4/slip44:118',
          totalValue: '2002965',
          components: [{ value: '2002965' }],
        },
      ],
    }

    const actual = await txParser.parse(tx, address)

    expect(expected).toEqual(actual)
  })
})
