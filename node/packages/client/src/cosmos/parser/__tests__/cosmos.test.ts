import { Status, Tx, TransferType } from '../../../types'
import { TransactionParser } from '../index'
import reward from './mockData/reward'
import standard from './mockData/standard'

const txParser = new TransactionParser({ chainId: 'cosmos:cosmoshub-4' })

describe('parseTx', () => {
  it('should be able to parse a standard send tx', async () => {
    const { tx } = standard
    const address = 'cosmos1t5u0jfg3ljsjrh2m9e47d4ny2hea7eehxrzdgd'

    const expected: Tx = {
      txid: tx.txid,
      blockHeight: Number(tx.blockHeight),
      blockTime: -1,
      confirmations: -1,
      status: Status.Confirmed,
      address: address,
      caip2: 'cosmos:cosmoshub-4',
      value: tx.value,
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
      blockHeight: Number(tx.blockHeight),
      blockTime: -1,
      confirmations: -1,
      status: Status.Confirmed,
      address: address,
      caip2: 'cosmos:cosmoshub-4',
      value: tx.value,
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

  it.only('should be able to parse a withdraw_delegator_reward tx', async () => {
    const { tx } = reward
    const address = 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05'

    const expected: Tx = {
      address,
      blockHeight: 9636957,
      blockTime: -1,
      caip2: 'cosmos:cosmoshub-4',
      confirmations: -1,
      status: Status.Confirmed,
      transfers: [
        {
          type: TransferType.Receive,
          caip19: 'cosmos:cosmoshub-4/slip44:118',
          from: 'cosmosvaloper1hdrlqvyjfy5sdrseecjrutyws9khtxxaux62l7',
          to: address,
          totalValue: '39447',
          components: [
            {
              value: '39447',
            },
          ],
          subtype: 'withdraw_delegator_reward',
        },
        {
          type: TransferType.Receive,
          caip19: 'cosmos:cosmoshub-4/slip44:118',
          from: 'cosmosvaloper1lzhlnpahvznwfv4jmay2tgaha5kmz5qxerarrl',
          to: address,
          totalValue: '7',
          components: [
            {
              value: '7',
            },
          ],
          subtype: 'withdraw_delegator_reward',
        },
      ],
      txid: 'E34AFB3A28198957040073034E16D4A979B403E672859651B41C207538136ABE',
      value: '',
    }

    const actual = await txParser.parse(tx, address)

    console.log('actual', JSON.stringify(actual, null, 2))
    //    console.log('expected', expected)
    expect(expected).toEqual(actual)
  })
})
