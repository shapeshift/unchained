import { Dex, Status, Trade, TradeType, TransferType, Tx, TxMetadata } from '../../types'
import { TransactionParser } from '../index'
import multiSigSendEth from './mockData/multiSigSendEth'
import thorSwapDepositEth from './mockData/thorSwapDepositEth'
import thorSwapDepositUsdc from './mockData/thorSwapDepositUsdc'
import thorSwapTransferOutEth from './mockData/thorSwapTransferOutEth'
import thorSwapTransferOutUsdc from './mockData/thorSwapTransferOutUsdc'
import thorSwapRefundEth from './mockData/thorSwapRefundEth'
import zrxTradeBondToUni from './mockData/zrxTradeBondToUni'
import zrxTradeEthToMatic from './mockData/zrxTradeEthToMatic'
import zrxTradeTetherToKishu from './mockData/zrxTradeTetherToKishu'
import zrxTradeTribeToEth from './mockData/zrxTradeTribeToEth'
import ethSelfSend from './mockData/ethSelfSend'
import tokenSelfSend from './mockData/tokenSelfSend'
import uniApprove from './mockData/uniApprove'
import uniAddLiquidity from './mockData/uniAddLiquidity'
import uniRemoveLiquidity from './mockData/uniRemoveLiquidity'
import foxClaim from './mockData/foxClaim'
import foxStake from './mockData/foxStake'
import foxExit from './mockData/foxExit'
import {
  bondToken,
  foxToken,
  kishuToken,
  maticToken,
  tribeToken,
  uniToken,
  uniV2Token,
  usdcToken,
  usdtToken,
} from './mockData/tokens'

jest.mock('@shapeshiftoss/thorchain')

const txParser = new TransactionParser({ midgardUrl: '', rpcUrl: '' })

const emptyMetaData: TxMetadata = {
  buyTx: undefined,
  sellTx: undefined,
}

describe('parseTx', () => {
  describe('multiSig', () => {
    it('should be able to parse eth multi sig send', async () => {
      const { tx, internalTxs } = multiSigSendEth
      const address = '0x76DA1578aC163CA7ca4143B7dEAa428e85Db3042'

      const standardTransfer = {
        caip19: 'eip155:1/slip44:60',
        components: [{ value: '1201235000000000000' }],
        from: '0x79fE68B3e4Bc2B91a4C8dfFb5317C7B8813d8Ae7',
        to: '0x76DA1578aC163CA7ca4143B7dEAa428e85Db3042',
        token: undefined,
        totalValue: '1201235000000000000',
        type: TransferType.Receive,
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: emptyMetaData,
        value: tx.value,
        status: Status.Confirmed,
        transfers: [standardTransfer],
      }

      const actual = await txParser.parse(tx, address, internalTxs)

      expect(expected).toEqual(actual)
    })
  })

  describe('thor', () => {
    it('should be able to parse eth deposit', async () => {
      const { tx } = thorSwapDepositEth
      const address = '0xCeb660E7623E8f8312B3379Df747c35f2217b595'
      const trade: Trade = {
        dexName: Dex.Thor,
        memo: 'SWAP:THOR.RUNE:thor19f3dsgetxzssvdmqnplfep5fe42fsrvq9u87ax:',
        type: TradeType.Trade,
      }
      const sellTransfer = {
        caip19: 'eip155:1/slip44:60',
        components: [{ value: '295040000000000000' }],
        from: '0xCeb660E7623E8f8312B3379Df747c35f2217b595',
        to: '0xC145990E84155416144C532E31f89B840Ca8c2cE',
        totalValue: '295040000000000000',
        type: TransferType.Send,
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: { sellTx: sellTransfer },
        value: tx.value,
        status: Status.Confirmed,
        fee: {
          caip19: 'eip155:1/slip44:60',
          value: '1700235000000000',
        },
        transfers: [sellTransfer],
        trade,
      }

      const actual = await txParser.parse(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse token deposit', async () => {
      const { tx } = thorSwapDepositUsdc
      const address = '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E'
      const trade: Trade = {
        dexName: Dex.Thor,
        memo: 'SWAP:THOR.RUNE:thor1hhjupkzy3t6ccelhz7qw8epyx4rm8a06nlm5ce:110928642111',
        type: TradeType.Trade,
      }
      const sellTransfer = {
        caip19: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        components: [{ value: '16598881497' }],
        from: '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E',
        to: '0xC145990E84155416144C532E31f89B840Ca8c2cE',
        token: usdcToken,
        totalValue: '16598881497',
        type: TransferType.Send,
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: {
          buyTx: undefined,
          sellTx: sellTransfer,
        },
        value: tx.value,
        status: Status.Confirmed,
        fee: {
          caip19: 'eip155:1/slip44:60',
          value: '4700280000000000',
        },
        transfers: [sellTransfer],
        trade,
      }

      const actual = await txParser.parse(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse eth transfer out', async () => {
      const { tx, internalTxs } = thorSwapTransferOutEth
      const address = '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E'
      const trade: Trade = {
        dexName: Dex.Thor,
        memo: 'OUT:8C859BA50BC2351797F52F954971E1C6BA1F0A77610AC197BD99C4EEC6A3692A',
        type: TradeType.Trade,
      }
      const buyTransfer = {
        caip19: 'eip155:1/slip44:60',
        components: [{ value: '1579727090000000000' }],
        from: '0xC145990E84155416144C532E31f89B840Ca8c2cE',
        to: '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E',
        token: undefined,
        totalValue: '1579727090000000000',
        type: TransferType.Receive,
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: { buyTx: buyTransfer },
        value: tx.value,
        status: Status.Confirmed,
        transfers: [buyTransfer],
        trade,
      }

      const actual = await txParser.parse(tx, address, internalTxs)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse token transfer out', async () => {
      const { tx } = thorSwapTransferOutUsdc
      const address = '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E'
      const trade: Trade = {
        dexName: Dex.Thor,
        memo: 'OUT:F3AC4E90AB5951AB9FEB1715B481422B904A40B0F6753CC844E326B1213CF70E',
        type: TradeType.Trade,
      }
      const buyTransfer = {
        caip19: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        components: [{ value: '47596471640' }],
        from: '0xC145990E84155416144C532E31f89B840Ca8c2cE',
        to: '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E',
        token: usdcToken,
        totalValue: '47596471640',
        type: TransferType.Receive,
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: { buyTx: buyTransfer },
        value: tx.value,
        status: Status.Confirmed,
        transfers: [buyTransfer],
        trade,
      }

      const actual = await txParser.parse(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse eth refund', async () => {
      const { tx, internalTxs } = thorSwapRefundEth
      const address = '0xfc0Cc6E85dFf3D75e3985e0CB83B090cfD498dd1'
      const trade: Trade = {
        dexName: Dex.Thor,
        memo: 'REFUND:851B4997CF8F9FBA806B3780E0C178CCB173AE78E3FD5056F7375B059B22BD3A',
        type: TradeType.Refund,
      }
      const buyTransfer = {
        caip19: 'eip155:1/slip44:60',
        components: [{ value: '6412730000000000' }],
        from: '0xC145990E84155416144C532E31f89B840Ca8c2cE',
        to: '0xfc0Cc6E85dFf3D75e3985e0CB83B090cfD498dd1',
        token: undefined,
        totalValue: '6412730000000000',
        type: TransferType.Receive,
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: { buyTx: buyTransfer },
        value: tx.value,
        status: Status.Confirmed,
        transfers: [buyTransfer],
        trade,
      }

      const actual = await txParser.parse(tx, address, internalTxs)

      expect(expected).toEqual(actual)
    })
  })

  describe('zrx', () => {
    it('should be able to parse token -> eth', async () => {
      const { tx, internalTxs } = zrxTradeTribeToEth
      const address = '0x5bb96c35a68Cba037D0F261C67477416db137F03'
      const trade: Trade = {
        dexName: Dex.Zrx,
        type: TradeType.Trade,
      }
      const buyTransfer = {
        caip19: 'eip155:1/slip44:60',
        components: [
          {
            value: '541566754246167133',
          },
        ],
        from: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
        to: '0x5bb96c35a68Cba037D0F261C67477416db137F03',
        token: undefined,
        totalValue: '541566754246167133',
        type: TransferType.Receive,
      }

      const sellTransfer = {
        caip19: 'eip155:1/erc20:0xc7283b66eb1eb5fb86327f08e1b5816b0720212b',
        components: [
          {
            value: '1000000000000000000000',
          },
        ],
        from: '0x5bb96c35a68Cba037D0F261C67477416db137F03',
        to: '0x7ce01885a13c652241aE02Ea7369Ee8D466802EB',
        token: tribeToken,
        totalValue: '1000000000000000000000',
        type: TransferType.Send,
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: {
          buyTx: buyTransfer,
          sellTx: sellTransfer,
        },
        value: tx.value,
        status: Status.Confirmed,
        fee: {
          value: '8308480000000000',
          caip19: 'eip155:1/slip44:60',
        },
        transfers: [sellTransfer, buyTransfer],
        trade,
      }

      const actual = await txParser.parse(tx, address, internalTxs)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse eth -> token', async () => {
      const { tx } = zrxTradeEthToMatic
      const address = '0x564BcA365D62BCC22dB53d032F8dbD35439C9206'
      const trade: Trade = {
        dexName: Dex.Zrx,
        type: TradeType.Trade,
      }

      const buyTransfer = {
        caip19: 'eip155:1/erc20:0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0',
        components: [
          {
            value: '50000000000000000000000',
          },
        ],
        from: '0x22F9dCF4647084d6C31b2765F6910cd85C178C18',
        to: '0x564BcA365D62BCC22dB53d032F8dbD35439C9206',
        token: maticToken,
        totalValue: '50000000000000000000000',
        type: TransferType.Receive,
      }

      const sellTransfer = {
        caip19: 'eip155:1/slip44:60',
        components: [
          {
            value: '10000000000000000000',
          },
        ],
        from: '0x564BcA365D62BCC22dB53d032F8dbD35439C9206',
        to: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
        token: undefined,
        totalValue: '10000000000000000000',
        type: TransferType.Send,
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: {
          buyTx: buyTransfer,
          sellTx: sellTransfer,
        },
        value: tx.value,
        status: Status.Confirmed,
        fee: {
          value: '19815285000000000',
          caip19: 'eip155:1/slip44:60',
        },
        transfers: [sellTransfer, buyTransfer],
        trade,
      }

      const actual = await txParser.parse(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse token -> token', async () => {
      const { tx } = zrxTradeTetherToKishu
      const address = '0xb8b19c048296E086DaF69F54d48dE2Da444dB047'
      const trade: Trade = {
        dexName: Dex.Zrx,
        type: TradeType.Trade,
      }

      const buyTransfer = {
        type: TransferType.Receive,
        from: '0xF82d8Ec196Fb0D56c6B82a8B1870F09502A49F88',
        to: '0xb8b19c048296E086DaF69F54d48dE2Da444dB047',
        caip19: 'eip155:1/erc20:0xa2b4c0af19cc16a6cfacce81f192b024d625817d',
        totalValue: '9248567698016204727450',
        components: [{ value: '9248567698016204727450' }],
        token: kishuToken,
      }

      const sellTransfer = {
        type: TransferType.Send,
        from: '0xb8b19c048296E086DaF69F54d48dE2Da444dB047',
        to: '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852',
        caip19: 'eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7',
        totalValue: '45000000000',
        components: [{ value: '45000000000' }],
        token: usdtToken,
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: {
          buyTx: buyTransfer,
          sellTx: sellTransfer,
        },
        value: tx.value,
        status: Status.Confirmed,
        fee: {
          value: '78183644000000000',
          caip19: 'eip155:1/slip44:60',
        },
        transfers: [sellTransfer, buyTransfer],
        trade,
      }

      const actual = await txParser.parse(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse token -> token (multiple swaps)', async () => {
      const { tx } = zrxTradeBondToUni
      const address = '0x986bB494db49E6f1CDC1be098e3157f8DDC5a821'
      const trade: Trade = {
        dexName: Dex.Zrx,
        type: TradeType.Trade,
      }

      const buyTransfer1 = {
        type: TransferType.Receive,
        from: '0xEBFb684dD2b01E698ca6c14F10e4f289934a54D6',
        to: address,
        caip19: 'eip155:1/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
        totalValue: '56639587020747520629',
        components: [{ value: '56639587020747520629' }],
        token: uniToken,
      }

      const buyTransfer2 = {
        type: TransferType.Receive,
        from: '0xd3d2E2692501A5c9Ca623199D38826e513033a17',
        to: address,
        caip19: 'eip155:1/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
        totalValue: '47448670568188553620',
        components: [{ value: '47448670568188553620' }],
        token: uniToken,
      }

      const sellTransfer1 = {
        type: TransferType.Send,
        from: address,
        to: '0x6591c4BcD6D7A1eb4E537DA8B78676C1576Ba244',
        caip19: 'eip155:1/erc20:0x0391d2021f89dc339f60fff84546ea23e337750f',
        totalValue: '53910224825217010944',
        components: [{ value: '53910224825217010944' }],
        token: bondToken,
      }

      const sellTransfer2 = {
        type: TransferType.Send,
        from: address,
        to: '0xB17B1342579e4bcE6B6e9A426092EA57d33843D9',
        caip19: 'eip155:1/erc20:0x0391d2021f89dc339f60fff84546ea23e337750f',
        totalValue: '46089775174782989056',
        components: [{ value: '46089775174782989056' }],
        token: bondToken,
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: {
          buyTx: buyTransfer1, // TODO - work out how we handle multiple buy txs
          sellTx: sellTransfer1, // TODO - work out how we handle multiple sell txs
        },
        value: tx.value,
        status: Status.Confirmed,
        fee: {
          value: '18399681000000000',
          caip19: 'eip155:1/slip44:60',
        },
        transfers: [sellTransfer1, buyTransfer1, sellTransfer2, buyTransfer2],
        trade,
      }

      const actual = await txParser.parse(tx, address)

      expect(expected).toEqual(actual)
    })
  })

  describe('self send', () => {
    it('should be able to parse eth mempool', async () => {
      const { txMempool } = ethSelfSend
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: Tx = {
        txid: txMempool.txid,
        blockHeight: txMempool.blockHeight,
        blockTime: txMempool.blockTime,
        address: address,
        caip2: 'eip155:1',
        confirmations: txMempool.confirmations,
        data: emptyMetaData,
        value: txMempool.value,
        status: Status.Pending,
        transfers: [
          {
            type: TransferType.Send,
            to: address,
            from: address,
            caip19: 'eip155:1/slip44:60',
            totalValue: '503100000000000',
            components: [{ value: '503100000000000' }],
          },
          {
            type: TransferType.Receive,
            to: address,
            from: address,
            caip19: 'eip155:1/slip44:60',
            totalValue: '503100000000000',
            components: [{ value: '503100000000000' }],
          },
        ],
      }

      const actual = await txParser.parse(txMempool, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse eth', async () => {
      const { tx } = ethSelfSend
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: Tx = {
        txid: tx.txid,
        blockHash: tx.blockHash,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: emptyMetaData,
        value: tx.value,
        status: Status.Confirmed,
        fee: {
          value: '399000000000000',
          caip19: 'eip155:1/slip44:60',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: address,
            to: address,
            caip19: 'eip155:1/slip44:60',
            totalValue: '503100000000000',
            components: [{ value: '503100000000000' }],
          },
          {
            type: TransferType.Receive,
            from: address,
            to: address,
            caip19: 'eip155:1/slip44:60',
            totalValue: '503100000000000',
            components: [{ value: '503100000000000' }],
          },
        ],
      }

      const actual = await txParser.parse(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse token mempool', async () => {
      const { txMempool } = tokenSelfSend
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: Tx = {
        txid: txMempool.txid,
        blockHeight: txMempool.blockHeight,
        blockTime: txMempool.blockTime,
        address: address,
        caip2: 'eip155:1',
        confirmations: txMempool.confirmations,
        data: emptyMetaData,
        value: txMempool.value,
        status: Status.Pending,
        transfers: [
          {
            type: TransferType.Send,
            from: address,
            to: address,
            caip19: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            totalValue: '1502080',
            components: [{ value: '1502080' }],
            token: usdcToken,
          },
          {
            type: TransferType.Receive,
            from: address,
            to: address,
            caip19: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            totalValue: '1502080',
            components: [{ value: '1502080' }],
            token: usdcToken,
          },
        ],
      }

      const actual = await txParser.parse(txMempool, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse token', async () => {
      const { tx } = tokenSelfSend
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: Tx = {
        txid: tx.txid,
        blockHash: tx.blockHash,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: emptyMetaData,
        value: tx.value,
        status: Status.Confirmed,
        fee: {
          value: '1011738000000000',
          caip19: 'eip155:1/slip44:60',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: address,
            to: address,
            caip19: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            totalValue: '1502080',
            components: [{ value: '1502080' }],
            token: usdcToken,
          },
          {
            type: TransferType.Receive,
            from: address,
            to: address,
            caip19: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            totalValue: '1502080',
            components: [{ value: '1502080' }],
            token: usdcToken,
          },
        ],
      }

      const actual = await txParser.parse(tx, address)

      expect(expected).toEqual(actual)
    })
  })

  describe('uniswap', () => {
    it('should be able to parse approve', async () => {
      const { tx } = uniApprove
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: emptyMetaData,
        value: tx.value,
        status: Status.Confirmed,
        fee: {
          value: '1447243200000000',
          caip19: 'eip155:1/slip44:60',
        },
        transfers: [],
      }

      const actual = await txParser.parse(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse add liquidity mempool', async () => {
      const { txMempool } = uniAddLiquidity
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: Tx = {
        txid: txMempool.txid,
        blockHeight: txMempool.blockHeight,
        blockTime: txMempool.blockTime,
        address: address,
        caip2: 'eip155:1',
        confirmations: txMempool.confirmations,
        data: emptyMetaData,
        value: txMempool.value,
        status: Status.Pending,
        transfers: [
          {
            type: TransferType.Send,
            from: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            to: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
            caip19: 'eip155:1/erc20:0xc770eefad204b5180df6a14ee197d99d808ee52d',
            totalValue: '100000000000000000000',
            components: [{ value: '100000000000000000000' }],
            token: {
              contract: '0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d',
              decimals: 18,
              name: 'FOX',
              symbol: 'FOX',
            },
          },
          {
            type: TransferType.Send,
            from: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            to: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
            caip19: 'eip155:1/slip44:60',
            totalValue: '42673718176645189',
            components: [{ value: '42673718176645189' }],
          },
        ],
      }

      const actual = await txParser.parse(txMempool, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse add liquidity', async () => {
      const { tx } = uniAddLiquidity
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: emptyMetaData,
        value: tx.value,
        status: Status.Confirmed,
        fee: {
          value: '26926494400000000',
          caip19: 'eip155:1/slip44:60',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            to: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
            caip19: 'eip155:1/slip44:60',
            totalValue: '42673718176645189',
            components: [{ value: '42673718176645189' }],
          },
          {
            type: TransferType.Send,
            from: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            to: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
            caip19: 'eip155:1/erc20:0xc770eefad204b5180df6a14ee197d99d808ee52d',
            totalValue: '100000000000000000000',
            components: [{ value: '100000000000000000000' }],
            token: foxToken,
          },
          {
            type: TransferType.Receive,
            from: '0x0000000000000000000000000000000000000000',
            to: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            caip19: 'eip155:1/erc20:0x470e8de2ebaef52014a47cb5e6af86884947f08c',
            totalValue: '1888842410762840601',
            components: [{ value: '1888842410762840601' }],
            token: uniV2Token,
          },
        ],
      }

      const actual = await txParser.parse(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse remove liquidity mempool', async () => {
      const { txMempool } = uniRemoveLiquidity
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: Tx = {
        txid: txMempool.txid,
        blockHeight: txMempool.blockHeight,
        blockTime: txMempool.blockTime,
        address: address,
        caip2: 'eip155:1',
        confirmations: txMempool.confirmations,
        data: emptyMetaData,
        value: txMempool.value,
        status: Status.Pending,
        transfers: [
          {
            type: TransferType.Send,
            from: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            to: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
            caip19: 'eip155:1/erc20:0x470e8de2ebaef52014a47cb5e6af86884947f08c',
            totalValue: '298717642142382954',
            components: [{ value: '298717642142382954' }],
            token: uniV2Token,
          },
        ],
      }

      const actual = await txParser.parse(txMempool, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse remove liquidity', async () => {
      const { tx, internalTxs } = uniRemoveLiquidity
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: emptyMetaData,
        value: tx.value,
        status: Status.Confirmed,
        fee: {
          value: '4082585000000000',
          caip19: 'eip155:1/slip44:60',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            to: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
            caip19: 'eip155:1/erc20:0x470e8de2ebaef52014a47cb5e6af86884947f08c',
            totalValue: '298717642142382954',
            components: [{ value: '298717642142382954' }],
            token: uniV2Token,
          },
          {
            type: TransferType.Receive,
            from: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
            to: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            caip19: 'eip155:1/erc20:0xc770eefad204b5180df6a14ee197d99d808ee52d',
            totalValue: '15785079906515930982',
            components: [{ value: '15785079906515930982' }],
            token: foxToken,
          },
          {
            type: TransferType.Receive,
            from: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
            to: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            caip19: 'eip155:1/slip44:60',
            totalValue: '6761476182340434',
            components: [{ value: '6761476182340434' }],
          },
        ],
      }

      const actual = await txParser.parse(tx, address, internalTxs)

      expect(expected).toEqual(actual)
    })
  })

  describe('fox', () => {
    it('should be able to parse claim', async () => {
      const { tx } = foxClaim
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: emptyMetaData,
        value: tx.value,
        status: Status.Confirmed,
        fee: {
          value: '2559843000000000',
          caip19: 'eip155:1/slip44:60',
        },
        transfers: [
          {
            type: TransferType.Receive,
            from: '0x02FfdC5bfAbe5c66BE067ff79231585082CA5fe2',
            to: address,
            caip19: 'eip155:1/erc20:0xc770eefad204b5180df6a14ee197d99d808ee52d',
            totalValue: '1500000000000000000000',
            components: [{ value: '1500000000000000000000' }],
            token: foxToken,
          },
        ],
      }

      const actual = await txParser.parse(tx, address)

      expect(expected).toEqual(actual)
    })

    // TODO: parse pending LP Token send to staking contract using stake() contract call
    it('should be able to parse stake mempool', async () => {
      const { txMempool } = foxStake
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: Tx = {
        txid: txMempool.txid,
        blockHeight: txMempool.blockHeight,
        blockTime: txMempool.blockTime,
        address: address,
        caip2: 'eip155:1',
        confirmations: txMempool.confirmations,
        data: emptyMetaData,
        value: txMempool.value,
        status: Status.Pending,
        transfers: [],
      }

      const actual = await txParser.parse(txMempool, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse stake', async () => {
      const { tx } = foxStake
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: emptyMetaData,
        value: tx.value,
        status: Status.Confirmed,
        fee: {
          value: '4650509500000000',
          caip19: 'eip155:1/slip44:60',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: address,
            to: '0xDd80E21669A664Bce83E3AD9a0d74f8Dad5D9E72',
            caip19: 'eip155:1/erc20:0x470e8de2ebaef52014a47cb5e6af86884947f08c',
            totalValue: '99572547380794318',
            components: [{ value: '99572547380794318' }],
            token: uniV2Token,
          },
        ],
      }

      const actual = await txParser.parse(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse exit mempool', async () => {
      const { txMempool } = foxExit
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: Tx = {
        txid: txMempool.txid,
        blockHeight: txMempool.blockHeight,
        blockTime: txMempool.blockTime,
        address: address,
        caip2: 'eip155:1',
        confirmations: txMempool.confirmations,
        data: emptyMetaData,
        value: txMempool.value,
        status: Status.Pending,
        transfers: [],
      }

      const actual = await txParser.parse(txMempool, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse exit', async () => {
      const { tx } = foxExit
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'eip155:1',
        confirmations: tx.confirmations,
        data: emptyMetaData,
        value: tx.value,
        status: Status.Confirmed,
        fee: {
          value: '6136186875000000',
          caip19: 'eip155:1/slip44:60',
        },
        transfers: [
          {
            type: TransferType.Receive,
            from: '0xDd80E21669A664Bce83E3AD9a0d74f8Dad5D9E72',
            to: address,
            caip19: 'eip155:1/erc20:0x470e8de2ebaef52014a47cb5e6af86884947f08c',
            totalValue: '531053586030903030',
            components: [{ value: '531053586030903030' }],
            token: uniV2Token,
          },
          {
            type: TransferType.Receive,
            from: '0xDd80E21669A664Bce83E3AD9a0d74f8Dad5D9E72',
            to: address,
            caip19: 'eip155:1/erc20:0xc770eefad204b5180df6a14ee197d99d808ee52d',
            totalValue: '317669338073988',
            components: [{ value: '317669338073988' }],
            token: foxToken,
          },
        ],
      }

      const actual = await txParser.parse(tx, address)

      expect(expected).toEqual(actual)
    })
  })
})
