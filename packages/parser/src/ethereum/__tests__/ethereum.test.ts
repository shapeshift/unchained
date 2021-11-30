import { Dex, Tx, Trade, TradeType, TransferType } from '../../types'
import { TransactionParser } from '../index'
import multiSigSendEth from './__mocks__/multiSigSendEth'
import thorSwapDepositEth from './__mocks__/thorSwapDepositEth'
import thorSwapDepositUsdc from './__mocks__/thorSwapDepositUsdc'
import thorSwapTransferOutEth from './__mocks__/thorSwapTransferOutEth'
import thorSwapTransferOutUsdc from './__mocks__/thorSwapTransferOutUsdc'
import thorSwapRefundEth from './__mocks__/thorSwapRefundEth'
import zrxTradeBondToUni from './__mocks__/zrxTradeBondToUni'
import zrxTradeEthToMatic from './__mocks__/zrxTradeEthToMatic'
import zrxTradeTetherToKishu from './__mocks__/zrxTradeTetherToKishu'
import zrxTradeTribeToEth from './__mocks__/zrxTradeTribeToEth'
import ethSelfSend from './__mocks__/ethSelfSend'
import tokenSelfSend from './__mocks__/tokenSelfSend'
import uniApprove from './__mocks__/uniApprove'
import uniAddLiquidity from './__mocks__/uniAddLiquidity'
import uniRemoveLiquidity from './__mocks__/uniRemoveLiquidity'
import foxClaim from './__mocks__/foxClaim'
import foxStake from './__mocks__/foxStake'
import foxExit from './__mocks__/foxExit'

jest.mock('@shapeshiftoss/thorchain')

const txParser = new TransactionParser({ midgardUrl: '', rpcUrl: '' })

describe('parseTx', () => {
  describe('multiSig', () => {
    it('should be able to parse eth multi sig send', async () => {
      const { tx, internalTxs } = multiSigSendEth
      const address = '0x76DA1578aC163CA7ca4143B7dEAa428e85Db3042'

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        transfers: [
          {
            type: TransferType.Receive,
            from: '0x79fE68B3e4Bc2B91a4C8dfFb5317C7B8813d8Ae7',
            to: '0x76DA1578aC163CA7ca4143B7dEAa428e85Db3042',
            caip19: 'ETH',
            totalValue: '1201235000000000000',
            components: [{ value: '1201235000000000000' }],
          },
        ],
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

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        fee: {
          caip19: 'ETH',
          value: '1700235000000000',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: '0xCeb660E7623E8f8312B3379Df747c35f2217b595',
            to: '0xC145990E84155416144C532E31f89B840Ca8c2cE',
            caip19: 'ETH',
            totalValue: '295040000000000000',
            components: [{ value: '295040000000000000' }],
          },
        ],
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
      const usdcToken = {
        contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
        name: 'USD Coin',
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        fee: {
          caip19: 'ETH',
          value: '4700280000000000',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E',
            to: '0xC145990E84155416144C532E31f89B840Ca8c2cE',
            caip19: 'USDC',
            totalValue: '16598881497',
            components: [{ value: '16598881497' }],
            token: usdcToken,
          },
        ],
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

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        transfers: [
          {
            type: TransferType.Receive,
            from: '0xC145990E84155416144C532E31f89B840Ca8c2cE',
            to: '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E',
            caip19: 'ETH',
            totalValue: '1579727090000000000',
            components: [{ value: '1579727090000000000' }],
          },
        ],
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
      const usdcToken = {
        contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
        name: 'USD Coin',
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        transfers: [
          {
            type: TransferType.Receive,
            from: '0xC145990E84155416144C532E31f89B840Ca8c2cE',
            to: '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E',
            caip19: 'USDC',
            totalValue: '47596471640',
            components: [{ value: '47596471640' }],
            token: usdcToken,
          },
        ],
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

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        transfers: [
          {
            type: TransferType.Receive,
            from: '0xC145990E84155416144C532E31f89B840Ca8c2cE',
            to: '0xfc0Cc6E85dFf3D75e3985e0CB83B090cfD498dd1',
            caip19: 'ETH',
            totalValue: '6412730000000000',
            components: [{ value: '6412730000000000' }],
          },
        ],
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
      const tribeToken = {
        contract: '0xc7283b66Eb1EB5FB86327f08e1B5816b0720212B',
        decimals: 18,
        name: 'Tribe',
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        fee: {
          value: '8308480000000000',
          caip19: 'ETH',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: '0x5bb96c35a68Cba037D0F261C67477416db137F03',
            to: '0x7ce01885a13c652241aE02Ea7369Ee8D466802EB',
            caip19: 'TRIBE',
            totalValue: '1000000000000000000000',
            components: [{ value: '1000000000000000000000' }],
            token: tribeToken,
          },
          {
            type: TransferType.Receive,
            from: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
            to: '0x5bb96c35a68Cba037D0F261C67477416db137F03',
            caip19: 'ETH',
            totalValue: '541566754246167133',
            components: [{ value: '541566754246167133' }],
          },
        ],
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
      const maticToken = {
        contract: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
        decimals: 18,
        name: 'Matic Token',
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        fee: {
          value: '19815285000000000',
          caip19: 'ETH',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: '0x564BcA365D62BCC22dB53d032F8dbD35439C9206',
            to: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
            caip19: 'ETH',
            totalValue: '10000000000000000000',
            components: [{ value: '10000000000000000000' }],
          },
          {
            type: TransferType.Receive,
            from: '0x22F9dCF4647084d6C31b2765F6910cd85C178C18',
            to: '0x564BcA365D62BCC22dB53d032F8dbD35439C9206',
            caip19: 'MATIC',
            totalValue: '50000000000000000000000',
            components: [{ value: '50000000000000000000000' }],
            token: maticToken,
          },
        ],
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
      const usdtToken = {
        contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6,
        name: 'Tether USD',
      }
      const kishuToken = {
        contract: '0xA2b4C0Af19cC16a6CfAcCe81F192B024d625817D',
        decimals: 9,
        name: 'Kishu Inu',
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        fee: {
          value: '78183644000000000',
          caip19: 'ETH',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: '0xb8b19c048296E086DaF69F54d48dE2Da444dB047',
            to: '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852',
            caip19: 'USDT',
            totalValue: '45000000000',
            components: [{ value: '45000000000' }],
            token: usdtToken,
          },
          {
            type: TransferType.Receive,
            from: '0xF82d8Ec196Fb0D56c6B82a8B1870F09502A49F88',
            to: '0xb8b19c048296E086DaF69F54d48dE2Da444dB047',
            caip19: 'KISHU',
            totalValue: '9248567698016204727450',
            components: [{ value: '9248567698016204727450' }],
            token: kishuToken,
          },
        ],
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
      const uniToken = {
        contract: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        decimals: 18,
        name: 'Uniswap',
      }
      const bondToken = {
        contract: '0x0391D2021f89DC339F60Fff84546EA23E337750f',
        decimals: 18,
        name: 'BarnBridge Governance Token',
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        fee: {
          value: '18399681000000000',
          caip19: 'ETH',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: address,
            to: '0x6591c4BcD6D7A1eb4E537DA8B78676C1576Ba244',
            caip19: 'BOND',
            totalValue: '53910224825217010944',
            components: [{ value: '53910224825217010944' }],
            token: bondToken,
          },
          {
            type: TransferType.Receive,
            from: '0xEBFb684dD2b01E698ca6c14F10e4f289934a54D6',
            to: address,
            caip19: 'UNI',
            totalValue: '56639587020747520629',
            components: [{ value: '56639587020747520629' }],
            token: uniToken,
          },
          {
            type: TransferType.Send,
            from: address,
            to: '0xB17B1342579e4bcE6B6e9A426092EA57d33843D9',
            caip19: 'BOND',
            totalValue: '46089775174782989056',
            components: [{ value: '46089775174782989056' }],
            token: bondToken,
          },
          {
            type: TransferType.Receive,
            from: '0xd3d2E2692501A5c9Ca623199D38826e513033a17',
            to: address,
            caip19: 'UNI',
            totalValue: '47448670568188553620',
            components: [{ value: '47448670568188553620' }],
            token: uniToken,
          },
        ],
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
        caip2: 'ETH',
        value: txMempool.value,
        transfers: [
          {
            type: TransferType.Send,
            to: address,
            from: address,
            caip19: 'ETH',
            totalValue: '503100000000000',
            components: [{ value: '503100000000000' }],
          },
          {
            type: TransferType.Receive,
            to: address,
            from: address,
            caip19: 'ETH',
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
        caip2: 'ETH',
        value: tx.value,
        fee: {
          value: '399000000000000',
          caip19: 'ETH',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: address,
            to: address,
            caip19: 'ETH',
            totalValue: '503100000000000',
            components: [{ value: '503100000000000' }],
          },
          {
            type: TransferType.Receive,
            from: address,
            to: address,
            caip19: 'ETH',
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
      const usdcToken = {
        contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
        name: 'USD Coin',
      }

      const expected: Tx = {
        txid: txMempool.txid,
        blockHeight: txMempool.blockHeight,
        blockTime: txMempool.blockTime,
        address: address,
        caip2: 'ETH',
        value: txMempool.value,
        transfers: [
          {
            type: TransferType.Send,
            from: address,
            to: address,
            caip19: 'USDC',
            totalValue: '1502080',
            components: [{ value: '1502080' }],
            token: usdcToken,
          },
          {
            type: TransferType.Receive,
            from: address,
            to: address,
            caip19: 'USDC',
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
      const usdcToken = {
        contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
        name: 'USD Coin',
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHash: tx.blockHash,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        fee: {
          value: '1011738000000000',
          caip19: 'ETH',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: address,
            to: address,
            caip19: 'USDC',
            totalValue: '1502080',
            components: [{ value: '1502080' }],
            token: usdcToken,
          },
          {
            type: TransferType.Receive,
            from: address,
            to: address,
            caip19: 'USDC',
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
        caip2: 'ETH',
        value: tx.value,
        fee: {
          value: '1447243200000000',
          caip19: 'ETH',
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
        caip2: 'ETH',
        value: txMempool.value,
        transfers: [
          {
            type: TransferType.Send,
            from: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            to: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
            caip19: 'FOX',
            totalValue: '100000000000000000000',
            components: [{ value: '100000000000000000000' }],
            token: {
              contract: '0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d',
              decimals: 18,
              name: 'FOX',
            },
          },
          {
            type: TransferType.Send,
            from: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            to: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
            caip19: 'ETH',
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
      const foxToken = {
        contract: '0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d',
        decimals: 18,
        name: 'FOX',
      }
      const uniV2Token = {
        contract: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
        decimals: 18,
        name: 'Uniswap V2',
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        fee: {
          value: '26926494400000000',
          caip19: 'ETH',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            to: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
            caip19: 'ETH',
            totalValue: '42673718176645189',
            components: [{ value: '42673718176645189' }],
          },
          {
            type: TransferType.Send,
            from: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            to: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
            caip19: 'FOX',
            totalValue: '100000000000000000000',
            components: [{ value: '100000000000000000000' }],
            token: foxToken,
          },
          {
            type: TransferType.Receive,
            from: '0x0000000000000000000000000000000000000000',
            to: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            caip19: 'UNI-V2',
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
      const uniV2Token = {
        contract: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
        decimals: 18,
        name: 'Uniswap V2',
      }

      const expected: Tx = {
        txid: txMempool.txid,
        blockHeight: txMempool.blockHeight,
        blockTime: txMempool.blockTime,
        address: address,
        caip2: 'ETH',
        value: txMempool.value,
        transfers: [
          {
            type: TransferType.Send,
            from: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            to: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
            caip19: 'UNI-V2',
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
      const foxToken = {
        contract: '0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d',
        decimals: 18,
        name: 'FOX',
      }
      const uniV2Token = {
        contract: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
        decimals: 18,
        name: 'Uniswap V2',
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        fee: {
          value: '4082585000000000',
          caip19: 'ETH',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            to: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
            caip19: 'UNI-V2',
            totalValue: '298717642142382954',
            components: [{ value: '298717642142382954' }],
            token: uniV2Token,
          },
          {
            type: TransferType.Receive,
            from: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
            to: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            caip19: 'FOX',
            totalValue: '15785079906515930982',
            components: [{ value: '15785079906515930982' }],
            token: foxToken,
          },
          {
            type: TransferType.Receive,
            from: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
            to: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C',
            caip19: 'ETH',
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
      const foxToken = {
        contract: '0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d',
        decimals: 18,
        name: 'FOX',
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        fee: {
          value: '2559843000000000',
          caip19: 'ETH',
        },
        transfers: [
          {
            type: TransferType.Receive,
            from: '0x02FfdC5bfAbe5c66BE067ff79231585082CA5fe2',
            to: address,
            caip19: 'FOX',
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
        caip2: 'ETH',
        value: txMempool.value,
        transfers: [],
      }

      const actual = await txParser.parse(txMempool, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse stake', async () => {
      const { tx } = foxStake
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'
      const uniV2Token = {
        contract: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
        decimals: 18,
        name: 'Uniswap V2',
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        fee: {
          value: '4650509500000000',
          caip19: 'ETH',
        },
        transfers: [
          {
            type: TransferType.Send,
            from: address,
            to: '0xDd80E21669A664Bce83E3AD9a0d74f8Dad5D9E72',
            caip19: 'UNI-V2',
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
        caip2: 'ETH',
        value: txMempool.value,
        transfers: [],
      }

      const actual = await txParser.parse(txMempool, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse exit', async () => {
      const { tx } = foxExit
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'
      const foxToken = {
        contract: '0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d',
        decimals: 18,
        name: 'FOX',
      }
      const uniV2Token = {
        contract: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
        decimals: 18,
        name: 'Uniswap V2',
      }

      const expected: Tx = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        blockTime: tx.blockTime,
        blockHash: tx.blockHash,
        address: address,
        caip2: 'ETH',
        value: tx.value,
        fee: {
          value: '6136186875000000',
          caip19: 'ETH',
        },
        transfers: [
          {
            type: TransferType.Receive,
            from: '0xDd80E21669A664Bce83E3AD9a0d74f8Dad5D9E72',
            to: address,
            caip19: 'UNI-V2',
            totalValue: '531053586030903030',
            components: [{ value: '531053586030903030' }],
            token: uniV2Token,
          },
          {
            type: TransferType.Receive,
            from: '0xDd80E21669A664Bce83E3AD9a0d74f8Dad5D9E72',
            to: address,
            caip19: 'FOX',
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
