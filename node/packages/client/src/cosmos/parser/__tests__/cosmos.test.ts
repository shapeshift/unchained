import { Status, TransferType } from '../../../types'
import { ParsedTx } from '../../types'
import { TransactionParser } from '../index'
import delegate from './mockData/delegate'
import undelegate from './mockData/undelegate'
import reward from './mockData/reward'
import redelegate from './mockData/redelegate'
import standard from './mockData/standard'

const txParser = new TransactionParser({ chainId: 'cosmos:cosmoshub-4' })

describe('parseTx', () => {
  it('should be able to parse a standard send tx', async () => {
    const { tx } = standard
    const address = 'cosmos1t5u0jfg3ljsjrh2m9e47d4ny2hea7eehxrzdgd'

    const expected: ParsedTx = {
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

    const expected: ParsedTx = {
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

  it('should be able to parse a delegate tx', async () => {
    const { tx } = delegate
    const address = 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05'
    const expected: ParsedTx = {
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
          components: [{ value: '1920000' }],
        },
      ],
      txid: '8136FF781B38919958249308CFABFD253CF371514661119BCD231875968BD06B',
      data: {
        parser: 'cosmos',
        method: 'delegate',
        delegator: 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05',
        destinationValidator: 'cosmosvaloper1lzhlnpahvznwfv4jmay2tgaha5kmz5qxerarrl',
      },
      fee: { caip19: 'cosmos:cosmoshub-4/slip44:118', value: '6250' },
    }

    const actual = await txParser.parse(tx, address)

    expect(expected).toEqual(actual)
  })

  it('should be able to parse a undelegate tx', async () => {
    const { tx } = undelegate
    const address = 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05'
    const expected: ParsedTx = {
      address: 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05',
      blockHash: '140D9DEC3087EA26248B60559D9C044F649749E4483E8E1F30143A8E47E7FFE8',
      blockHeight: 9636932,
      blockTime: 1645207449,
      caip2: 'cosmos:cosmoshub-4',
      confirmations: 358801,
      status: Status.Confirmed,
      transfers: [],
      txid: '1795FE6ED7B5A8C5478CBDE27F35C8FB64FC6229B7B90FA47D4406AA2078BBAB',
      data: {
        parser: 'cosmos',
        method: 'begin_unbonding',
        delegator: 'cosmosvaloper1sjllsnramtg3ewxqwwrwjxfgc4n4ef9u2lcnj0',
        destinationValidator: 'cosmos1fx4jwv3aalxqwmrpymn34l582lnehr3eqwuz9e',
      },
    }

    const actual = await txParser.parse(tx, address)

    expect(expected).toEqual(actual)
  })

  it('should be able to parse a redelegate tx', async () => {
    const { tx } = redelegate
    const address = 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05'
    const expected: ParsedTx = {
      address: 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05',
      blockHash: 'C3B387CF51B0957D52A79CF5EB4E50665661AC9528C6A65501EB45DA3D3A4A49',
      blockHeight: 9636911,
      blockTime: 1645207449,
      caip2: 'cosmos:cosmoshub-4',
      confirmations: 358801,
      status: Status.Confirmed,
      transfers: [],
      txid: 'A69531AE72161D6556CEE744D5D6B3D0661443FA66C89360F40EC75CF7E278CA',
      data: {
        parser: 'cosmos',
        method: 'begin_redelegate',
        sourceValidator: 'cosmosvaloper1sjllsnramtg3ewxqwwrwjxfgc4n4ef9u2lcnj0',
        destinationValidator: 'cosmosvaloper156gqf9837u7d4c4678yt3rl4ls9c5vuursrrzf',
      },
    }

    const actual = await txParser.parse(tx, address)

    expect(expected).toEqual(actual)
  })

  it('should be able to parse a reward tx', async () => {
    const { tx } = reward
    const address = 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05'
    const expected: ParsedTx = {
      address: 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05',
      blockHeight: 9636957,
      blockTime: 1645207449,
      caip2: 'cosmos:cosmoshub-4',
      confirmations: 358801,
      status: Status.Confirmed,
      transfers: [],
      txid: 'E34AFB3A28198957040073034E16D4A979B403E672859651B41C207538136ABE',
      data: {
        parser: 'cosmos',
        method: 'withdraw_delegator_reward',
        destinationValidator: 'cosmos179k2lz70rxvjrvvr65cynw9x5c8v3kftg46v05',
        value: '39447',
        caip19: 'cosmos:cosmoshub-4/slip44:118',
      },
    }

    const actual = await txParser.parse(tx, address)

    expect(expected).toEqual(actual)
  })
})
