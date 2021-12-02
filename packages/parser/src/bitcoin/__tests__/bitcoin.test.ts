import { Status, Tx, TransferType } from '../../types'
import { TransactionParser } from '../index'
import standardNoChange from './__mocks__/standardNoChange'

const txParser = new TransactionParser({ rpcUrl: '' })

describe('parseTx', () => {
  it('should be able to parse standard send with no change mempool', async () => {
    const { txMempool } = standardNoChange
    const address = '1ALpDTSP3BmBYKDudG8sLmt9ppDRNwqunj'

    const expected: Tx = {
      txid: txMempool.txid,
      blockHeight: txMempool.blockHeight,
      blockTime: txMempool.blockTime,
      confirmations: txMempool.confirmations,
      status: Status.Pending,
      address: address,
      caip2: 'bip122:000000000019d6689c085ae165831e93',
      value: txMempool.value,
      fee: {
        caip19: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
        value: '6528',
      },
      transfers: [
        {
          type: TransferType.Send,
          from: '1ALpDTSP3BmBYKDudG8sLmt9ppDRNwqunj',
          to: '1KcXirKZg5bNnwAKGCTDprwJXivtFyAQc7',
          caip19: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
          totalValue: '12989718',
          components: [{ value: '12989718' }],
        },
      ],
    }

    const actual = await txParser.parse(txMempool, address)

    expect(expected).toEqual(actual)
  })

  it('should be able to parse standard send with no change', async () => {
    const { tx } = standardNoChange
    const address = '1ALpDTSP3BmBYKDudG8sLmt9ppDRNwqunj'

    const expected: Tx = {
      txid: tx.txid,
      blockHeight: tx.blockHeight,
      blockTime: tx.blockTime,
      blockHash: tx.blockHash,
      confirmations: tx.confirmations,
      status: Status.Confirmed,
      address: address,
      caip2: 'bip122:000000000019d6689c085ae165831e93',
      value: tx.value,
      fee: {
        caip19: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
        value: '6528',
      },
      transfers: [
        {
          type: TransferType.Send,
          from: '1ALpDTSP3BmBYKDudG8sLmt9ppDRNwqunj',
          to: '1KcXirKZg5bNnwAKGCTDprwJXivtFyAQc7',
          caip19: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
          totalValue: '12989718',
          components: [{ value: '12989718' }],
        },
      ],
    }

    const actual = await txParser.parse(tx, address)

    expect(expected).toEqual(actual)
  })

  it('should be able to parse standard receive mempool', async () => {
    const { txMempool } = standardNoChange
    const address = '1KcXirKZg5bNnwAKGCTDprwJXivtFyAQc7'

    const expected: Tx = {
      txid: txMempool.txid,
      blockHeight: txMempool.blockHeight,
      blockTime: txMempool.blockTime,
      confirmations: txMempool.confirmations,
      status: Status.Pending,
      address: address,
      caip2: 'bip122:000000000019d6689c085ae165831e93',
      value: txMempool.value,
      transfers: [
        {
          type: TransferType.Receive,
          to: '1KcXirKZg5bNnwAKGCTDprwJXivtFyAQc7',
          from: '1ALpDTSP3BmBYKDudG8sLmt9ppDRNwqunj',
          caip19: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
          totalValue: '12983190',
          components: [{ value: '12983190' }],
        },
      ],
    }

    const actual = await txParser.parse(txMempool, address)

    expect(expected).toEqual(actual)
  })

  it('should be able to parse standard receive', async () => {
    const { tx } = standardNoChange
    const address = '1KcXirKZg5bNnwAKGCTDprwJXivtFyAQc7'

    const expected: Tx = {
      txid: tx.txid,
      blockHeight: tx.blockHeight,
      blockTime: tx.blockTime,
      blockHash: tx.blockHash,
      confirmations: tx.confirmations,
      status: Status.Confirmed,
      address: address,
      caip2: 'bip122:000000000019d6689c085ae165831e93',
      value: tx.value,
      transfers: [
        {
          type: TransferType.Receive,
          to: '1KcXirKZg5bNnwAKGCTDprwJXivtFyAQc7',
          from: '1ALpDTSP3BmBYKDudG8sLmt9ppDRNwqunj',
          caip19: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
          totalValue: '12983190',
          components: [{ value: '12983190' }],
        },
      ],
    }

    const actual = await txParser.parse(tx, address)

    expect(expected).toEqual(actual)
  })
})
