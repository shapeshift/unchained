import { Status, Tx, TransferType } from '../../../types'
import { TransactionParser } from '../index'
import delegate from './mockData/delegate'
import redelegate from './mockData/redelegate'
import reward from './mockData/reward'
import standard from './mockData/standard'
import undelegate from './mockData/undelegate'

const txParser = new TransactionParser({ chainId: 'cosmos:cosmoshub-4' })

describe('parseTx', () => {
  it('should be able to parse a standard send tx', async () => {
    const { tx } = standard
    const address = 'cosmos1t5u0jfg3ljsjrh2m9e47d4ny2hea7eehxrzdgd'

    const expected: Tx = {
      address: 'cosmos1t5u0jfg3ljsjrh2m9e47d4ny2hea7eehxrzdgd',
      caip2: 'cosmos:cosmoshub-4',
      txid: tx.txid,
      blockHash: tx.blockHash,
      blockHeight: tx.blockHeight,
      blockTime: tx.timestamp,
      confirmations: tx.confirmations,
      status: Status.Confirmed,
      transfers: [
        {
          type: TransferType.Send,
          caip19: 'cosmos:cosmoshub-4/slip44:118',
          from: 'cosmos1t5u0jfg3ljsjrh2m9e47d4ny2hea7eehxrzdgd',
          to: 'cosmos14e25lpsedq863vgweqg4m9n0z28c203kfdlzmz',
          totalValue: '2002965',
          components: [
            {
              value: '2002965',
            },
          ],
        },
      ],
      value: '2002965',
      data: {
        parser: 'cosmos',
        method: 'send',
        extras: {
          from: 'cosmos1t5u0jfg3ljsjrh2m9e47d4ny2hea7eehxrzdgd',
          to: 'cosmos14e25lpsedq863vgweqg4m9n0z28c203kfdlzmz',
          caip19: 'cosmos:cosmoshub-4/slip44:118',
          value: '2002965',
        },
      },
      fee: {
        caip19: 'cosmos:cosmoshub-4/slip44:118',
        value: '2500',
      },
    }

    const actual = await txParser.parse(tx, address)

    expect(expected).toEqual(actual)
  })

  it('should be able to parse a standard receive tx', async () => {
    const { tx } = standard
    const address = 'cosmos14e25lpsedq863vgweqg4m9n0z28c203kfdlzmz'

    const expected: Tx = {
      address: 'cosmos14e25lpsedq863vgweqg4m9n0z28c203kfdlzmz',
      caip2: 'cosmos:cosmoshub-4',
      txid: tx.txid,
      blockHash: tx.blockHash,
      blockHeight: tx.blockHeight,
      blockTime: tx.timestamp,
      confirmations: tx.confirmations,
      status: Status.Confirmed,
      transfers: [
        {
          type: TransferType.Receive,
          caip19: 'cosmos:cosmoshub-4/slip44:118',
          from: 'cosmos1t5u0jfg3ljsjrh2m9e47d4ny2hea7eehxrzdgd',
          to: 'cosmos14e25lpsedq863vgweqg4m9n0z28c203kfdlzmz',
          totalValue: '2002965',
          components: [
            {
              value: '2002965',
            },
          ],
        },
      ],
      value: '2002965',
      data: {
        parser: 'cosmos',
        method: 'send',
        extras: {
          from: 'cosmos1t5u0jfg3ljsjrh2m9e47d4ny2hea7eehxrzdgd',
          to: 'cosmos14e25lpsedq863vgweqg4m9n0z28c203kfdlzmz',
          caip19: 'cosmos:cosmoshub-4/slip44:118',
          value: '2002965',
        },
      },
    }

    const actual = await txParser.parse(tx, address)

    expect(expected).toEqual(actual)
  })

  it('should be able to parse a withdraw_delegator_reward tx', async () => {
    const { tx } = reward
    const address = 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05'

    const expected: Tx = {
      address: 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05',
      blockHeight: 9636957,
      blockTime: 1645207449,
      caip2: 'cosmos:cosmoshub-4',
      confirmations: 358801,
      status: Status.Confirmed,
      transfers: [
        {
          type: TransferType.Receive,
          caip19: 'cosmos:cosmoshub-4/slip44:118',
          from: 'cosmosvaloper1hdrlqvyjfy5sdrseecjrutyws9khtxxaux62l7',
          to: 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05',
          totalValue: '39447',
          components: [
            {
              value: '39447',
            },
          ],
        },
      ],
      txid: 'E34AFB3A28198957040073034E16D4A979B403E672859651B41C207538136ABE',
      value: '39447',
      data: {
        parser: 'cosmos',
        method: 'withdraw_delegator_reward',
        extras: {
          from: 'cosmosvaloper1hdrlqvyjfy5sdrseecjrutyws9khtxxaux62l7',
          to: 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05',
          caip19: 'cosmos:cosmoshub-4/slip44:118',
          value: '39447',
        },
      },
    }

    const actual = await txParser.parse(tx, address)

    expect(expected).toEqual(actual)
  })
})

it('should be able to parse a delegate tx', async () => {
  const { tx } = delegate
  const address = 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05'

  const expected: Tx = {
    address: 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05',
    blockHash: 'D8186504233B8AD92ED2799D88A16A38F706889A99F1AEC49A6EA96EC94AE4E7',
    blockHeight: 9636923,
    blockTime: 1645207449,
    caip2: 'cosmos:cosmoshub-4',
    confirmations: 358801,
    status: Status.Confirmed,
    transfers: [
      {
        type: TransferType.Send,
        caip19: 'cosmos:cosmoshub-4/slip44:118',
        from: 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05',
        to: 'cosmosvaloper1lzhlnpahvznwfv4jmay2tgaha5kmz5qxerarrl',
        totalValue: '1920000',
        components: [
          {
            value: '1920000',
          },
        ],
      },
    ],
    txid: '8136FF781B38919958249308CFABFD253CF371514661119BCD231875968BD06B',
    value: '1920000',
    data: {
      parser: 'cosmos',
      method: 'delegate',
      extras: {
        from: 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05',
        to: 'cosmosvaloper1lzhlnpahvznwfv4jmay2tgaha5kmz5qxerarrl',
        caip19: 'cosmos:cosmoshub-4/slip44:118',
        value: '1920000',
      },
    },
    fee: {
      caip19: 'cosmos:cosmoshub-4/slip44:118',
      value: '6250',
    },
  }

  const actual = await txParser.parse(tx, address)

  expect(expected).toEqual(actual)
})

it('should be able to parse an undelegate tx', async () => {
  const { tx } = undelegate
  const address = 'cosmos1fx4jwv3aalxqwmrpymn34l582lnehr3eqwuz9e'

  const expected: Tx = {
    address: 'cosmos1fx4jwv3aalxqwmrpymn34l582lnehr3eqwuz9e',
    blockHash: '140D9DEC3087EA26248B60559D9C044F649749E4483E8E1F30143A8E47E7FFE8',
    blockHeight: 9636932,
    blockTime: 1645207449,
    caip2: 'cosmos:cosmoshub-4',
    confirmations: 358801,
    status: Status.Confirmed,
    transfers: [
      {
        type: TransferType.Receive,
        caip19: 'cosmos:cosmoshub-4/slip44:118',
        from: 'cosmosvaloper1sjllsnramtg3ewxqwwrwjxfgc4n4ef9u2lcnj0',
        to: 'cosmos1fx4jwv3aalxqwmrpymn34l582lnehr3eqwuz9e',
        totalValue: '200000',
        components: [
          {
            value: '200000',
          },
        ],
      },
    ],
    txid: '1795FE6ED7B5A8C5478CBDE27F35C8FB64FC6229B7B90FA47D4406AA2078BBAB',
    value: '200000',
    data: {
      parser: 'cosmos',
      method: 'begin_unbonding',
      extras: {
        from: 'cosmosvaloper1sjllsnramtg3ewxqwwrwjxfgc4n4ef9u2lcnj0',
        to: 'cosmos1fx4jwv3aalxqwmrpymn34l582lnehr3eqwuz9e',
        caip19: 'cosmos:cosmoshub-4/slip44:118',
        value: '200000',
      },
    },
  }

  const actual = await txParser.parse(tx, address)

  expect(expected).toEqual(actual)
})

it('should be able to parse a redelegate tx', async () => {
  const { tx } = redelegate
  const address = 'cosmos1fx4jwv3aalxqwmrpymn34l582lnehr3eqwuz9e'

  const expected: Tx = {
    address: 'cosmos1fx4jwv3aalxqwmrpymn34l582lnehr3eqwuz9e',
    blockHash: 'C3B387CF51B0957D52A79CF5EB4E50665661AC9528C6A65501EB45DA3D3A4A49',
    blockHeight: 9636911,
    blockTime: 1645207449,
    caip2: 'cosmos:cosmoshub-4',
    confirmations: 358801,
    status: Status.Confirmed,
    transfers: [],
    txid: 'A69531AE72161D6556CEE744D5D6B3D0661443FA66C89360F40EC75CF7E278CA',
    value: '500000',
    data: {
      parser: 'cosmos',
      method: 'begin_redelegate',
      extras: {
        from: 'cosmosvaloper1sjllsnramtg3ewxqwwrwjxfgc4n4ef9u2lcnj0',
        to: 'cosmosvaloper156gqf9837u7d4c4678yt3rl4ls9c5vuursrrzf',
        caip19: 'cosmos:cosmoshub-4/slip44:118',
        value: '500000',
      },
    },
    fee: {
      caip19: 'cosmos:cosmoshub-4/slip44:118',
      value: '6250',
    },
  }

  const actual = await txParser.parse(tx, address)

  expect(expected).toEqual(actual)
})
