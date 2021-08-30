import { ParseTx, Refund, Trade } from '@shapeshiftoss/common-ingester'
import { parseTx } from '../parseTx'
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

describe('parseTx', () => {
  describe('multiSig', () => {
    it('should be able to parse eth multi sig send', async () => {
      const { tx, internalTxs } = multiSigSendEth
      const address = '0x76DA1578aC163CA7ca4143B7dEAa428e85Db3042'

      const expected: ParseTx = {
        ...tx,
        address: address,
        send: {},
        receive: {
          ETH: {
            totalValue: '1201235000000000000',
            components: [{ value: '1201235000000000000' }],
          },
        },
      }

      const actual = await parseTx(tx, address, internalTxs)

      expect(expected).toEqual(actual)
    })
  })

  describe('thor', () => {
    it('should be able to parse eth deposit', async () => {
      const { tx } = thorSwapDepositEth
      const address = '0xCeb660E7623E8f8312B3379Df747c35f2217b595'
      const trade: Trade = {
        dexName: 'thor',
        buyAsset: 'THOR.RUNE',
        buyAmount: '',
        feeAsset: '',
        feeAmount: '',
        memo: 'SWAP:THOR.RUNE:thor19f3dsgetxzssvdmqnplfep5fe42fsrvq9u87ax:',
        sellAsset: 'ETH',
        sellAmount: '295040000000000000',
      }

      const expected: ParseTx = {
        ...tx,
        address: address,
        fee: {
          symbol: 'ETH',
          value: '1700235000000000',
        },
        send: {
          ETH: {
            totalValue: '295040000000000000',
            components: [{ value: '295040000000000000' }],
          },
        },
        receive: {},
        trade,
      }

      const actual = await parseTx(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse token deposit', async () => {
      const { tx } = thorSwapDepositUsdc
      const address = '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E'
      const trade: Trade = {
        dexName: 'thor',
        buyAsset: 'THOR.RUNE',
        buyAmount: '',
        feeAsset: '',
        feeAmount: '',
        memo: 'SWAP:THOR.RUNE:thor1hhjupkzy3t6ccelhz7qw8epyx4rm8a06nlm5ce:110928642111',
        sellAsset: 'USDC',
        sellAmount: '16598881497',
      }
      const usdcToken = {
        contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
        name: 'USD Coin',
      }

      const expected: ParseTx = {
        ...tx,
        address: address,
        fee: {
          symbol: 'ETH',
          value: '4700280000000000',
        },
        send: {
          USDC: {
            totalValue: '16598881497',
            components: [{ value: '16598881497' }],
            token: usdcToken,
          },
        },
        receive: {},
        trade,
      }

      const actual = await parseTx(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse eth transfer out', async () => {
      const { tx, internalTxs } = thorSwapTransferOutEth
      const address = '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E'
      const trade: Trade = {
        dexName: 'thor',
        buyAsset: 'ETH',
        buyAmount: '1579727090000000000',
        buyNetwork: 'ETH',
        feeAsset: 'ETH',
        feeAmount: '9600000000000000',
        feeNetwork: 'ETH',
        liquidityFee: '70840351',
        memo: 'OUT:8C859BA50BC2351797F52F954971E1C6BA1F0A77610AC197BD99C4EEC6A3692A',
        sellAsset: 'USDC',
        sellAmount: '4173773898',
        sellNetwork: 'ETH',
      }

      const expected: ParseTx = {
        ...tx,
        address: address,
        send: {},
        receive: {
          ETH: {
            totalValue: '1579727090000000000',
            components: [{ value: '1579727090000000000' }],
          },
        },
        trade,
      }

      const actual = await parseTx(tx, address, internalTxs)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse token transfer out', async () => {
      const { tx } = thorSwapTransferOutUsdc
      const address = '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E'
      const trade: Trade = {
        dexName: 'thor',
        buyAsset: 'USDC',
        buyAmount: '47596471640',
        buyNetwork: 'ETH',
        feeAsset: 'USDC',
        feeAmount: '355025526',
        feeNetwork: 'ETH',
        liquidityFee: '11745645806',
        memo: 'OUT:F3AC4E90AB5951AB9FEB1715B481422B904A40B0F6753CC844E326B1213CF70E',
        sellAsset: 'RUNE',
        sellAmount: '510423341825',
        sellNetwork: 'THOR',
      }
      const usdcToken = {
        contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
        name: 'USD Coin',
      }

      const expected: ParseTx = {
        ...tx,
        address: address,
        send: {},
        receive: {
          USDC: {
            totalValue: '47596471640',
            components: [{ value: '47596471640' }],
            token: usdcToken,
          },
        },
        trade,
      }

      const actual = await parseTx(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse eth refund', async () => {
      const { tx, internalTxs } = thorSwapRefundEth
      const address = '0xfc0Cc6E85dFf3D75e3985e0CB83B090cfD498dd1'
      const refund: Refund = {
        dexName: 'thor',
        feeAsset: 'ETH',
        feeAmount: '7200000000000000',
        feeNetwork: 'ETH',
        memo: 'REFUND:851B4997CF8F9FBA806B3780E0C178CCB173AE78E3FD5056F7375B059B22BD3A',
        refundAsset: 'ETH',
        refundAmount: '6412730000000000',
        refundNetwork: 'ETH',
        sellAsset: 'ETH',
        sellAmount: '13612730000000000',
        sellNetwork: 'ETH',
      }

      const expected: ParseTx = {
        ...tx,
        address: address,
        send: {},
        receive: {
          ETH: {
            totalValue: '6412730000000000',
            components: [{ value: '6412730000000000' }],
          },
        },
        refund,
      }

      const actual = await parseTx(tx, address, internalTxs)

      expect(expected).toEqual(actual)
    })
  })

  describe('zrx', () => {
    it('should be able to parse token -> eth', async () => {
      const { tx, internalTxs } = zrxTradeTribeToEth
      const address = '0x5bb96c35a68Cba037D0F261C67477416db137F03'
      const trade: Trade = {
        dexName: 'zrx',
        buyAsset: 'ETH',
        buyAmount: '541566754246167133',
        feeAsset: 'ETH',
        feeAmount: '8308480000000000',
        sellAsset: 'TRIBE',
        sellAmount: '1000000000000000000000',
      }
      const tribeToken = {
        contract: '0xc7283b66Eb1EB5FB86327f08e1B5816b0720212B',
        decimals: 18,
        name: 'Tribe',
      }

      const expected: ParseTx = {
        ...tx,
        address: address,
        fee: {
          value: '8308480000000000',
          symbol: 'ETH',
        },
        send: {
          TRIBE: {
            totalValue: '1000000000000000000000',
            components: [{ value: '1000000000000000000000' }],
            token: tribeToken,
          },
        },
        receive: {
          ETH: {
            totalValue: '541566754246167133',
            components: [{ value: '541566754246167133' }],
          },
        },
        trade,
      }

      const actual = await parseTx(tx, address, internalTxs)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse eth -> token', async () => {
      const { tx } = zrxTradeEthToMatic
      const address = '0x564BcA365D62BCC22dB53d032F8dbD35439C9206'
      const trade: Trade = {
        dexName: 'zrx',
        buyAsset: 'MATIC',
        buyAmount: '50000000000000000000000',
        feeAsset: 'ETH',
        feeAmount: '19815285000000000',
        sellAsset: 'ETH',
        sellAmount: '10000000000000000000',
      }
      const maticToken = {
        contract: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
        decimals: 18,
        name: 'Matic Token',
      }

      const expected: ParseTx = {
        ...tx,
        address: address,
        fee: {
          value: '19815285000000000',
          symbol: 'ETH',
        },
        send: {
          ETH: {
            totalValue: '10000000000000000000',
            components: [{ value: '10000000000000000000' }],
          },
        },
        receive: {
          MATIC: {
            totalValue: '50000000000000000000000',
            components: [{ value: '50000000000000000000000' }],
            token: maticToken,
          },
        },
        trade,
      }

      const actual = await parseTx(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse token -> token', async () => {
      const { tx } = zrxTradeTetherToKishu
      const address = '0xb8b19c048296E086DaF69F54d48dE2Da444dB047'
      const trade: Trade = {
        dexName: 'zrx',
        buyAsset: 'KISHU',
        buyAmount: '9248567698016204727450',
        feeAsset: 'ETH',
        feeAmount: '78183644000000000',
        sellAsset: 'USDT',
        sellAmount: '45000000000',
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

      const expected: ParseTx = {
        ...tx,
        address: address,
        fee: {
          value: '78183644000000000',
          symbol: 'ETH',
        },
        send: {
          USDT: {
            totalValue: '45000000000',
            components: [{ value: '45000000000' }],
            token: usdtToken,
          },
        },
        receive: {
          KISHU: {
            totalValue: '9248567698016204727450',
            components: [{ value: '9248567698016204727450' }],
            token: kishuToken,
          },
        },
        trade,
      }

      const actual = await parseTx(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse token -> token (multiple swaps)', async () => {
      const { tx } = zrxTradeBondToUni
      const address = '0x986bB494db49E6f1CDC1be098e3157f8DDC5a821'
      const trade: Trade = {
        dexName: 'zrx',
        buyAsset: 'UNI',
        buyAmount: '104088257588936074249',
        feeAsset: 'ETH',
        feeAmount: '18399681000000000',
        sellAsset: 'BOND',
        sellAmount: '100000000000000000000',
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

      const expected: ParseTx = {
        ...tx,
        address: address,
        fee: {
          value: '18399681000000000',
          symbol: 'ETH',
        },
        send: {
          BOND: {
            totalValue: '100000000000000000000',
            components: [{ value: '53910224825217010944' }, { value: '46089775174782989056' }],
            token: bondToken,
          },
        },
        receive: {
          UNI: {
            totalValue: '104088257588936074249',
            components: [{ value: '56639587020747520629' }, { value: '47448670568188553620' }],
            token: uniToken,
          },
        },
        trade,
      }

      const actual = await parseTx(tx, address)

      expect(expected).toEqual(actual)
    })
  })

  describe('self send', () => {
    it('should be able to parse eth mempool', async () => {
      const { txMempool } = ethSelfSend
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: ParseTx = {
        ...txMempool,
        address: address,
        send: {
          ETH: {
            totalValue: '503100000000000',
            components: [{ value: '503100000000000' }],
          },
        },
        receive: {
          ETH: {
            totalValue: '503100000000000',
            components: [{ value: '503100000000000' }],
          },
        },
      }

      const actual = await parseTx(txMempool, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse eth', async () => {
      const { tx } = ethSelfSend
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: ParseTx = {
        ...tx,
        address: address,
        fee: {
          value: '399000000000000',
          symbol: 'ETH',
        },
        send: {
          ETH: {
            totalValue: '503100000000000',
            components: [{ value: '503100000000000' }],
          },
        },
        receive: {
          ETH: {
            totalValue: '503100000000000',
            components: [{ value: '503100000000000' }],
          },
        },
      }

      const actual = await parseTx(tx, address)

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

      const expected: ParseTx = {
        ...txMempool,
        address: address,
        send: {
          USDC: {
            totalValue: '1502080',
            components: [{ value: '1502080' }],
            token: usdcToken,
          },
        },
        receive: {
          USDC: {
            totalValue: '1502080',
            components: [{ value: '1502080' }],
            token: usdcToken,
          },
        },
      }

      const actual = await parseTx(txMempool, address)

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

      const expected: ParseTx = {
        ...tx,
        address: address,
        fee: {
          value: '1011738000000000',
          symbol: 'ETH',
        },
        send: {
          USDC: {
            totalValue: '1502080',
            components: [{ value: '1502080' }],
            token: usdcToken,
          },
        },
        receive: {
          USDC: {
            totalValue: '1502080',
            components: [{ value: '1502080' }],
            token: usdcToken,
          },
        },
      }

      const actual = await parseTx(tx, address)

      expect(expected).toEqual(actual)
    })
  })

  describe('uniswap', () => {
    it('should be able to parse approve', async () => {
      const { tx } = uniApprove
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: ParseTx = {
        ...tx,
        address: address,
        fee: {
          value: '1447243200000000',
          symbol: 'ETH',
        },
        send: {},
        receive: {},
      }

      const actual = await parseTx(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse add liquidity mempool', async () => {
      const { txMempool } = uniAddLiquidity
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: ParseTx = {
        ...txMempool,
        address: address,
        send: {
          ETH: {
            totalValue: '42673718176645189',
            components: [{ value: '42673718176645189' }],
          },
          FOX: {
            totalValue: '100000000000000000000',
            components: [{ value: '100000000000000000000' }],
            token: {
              contract: '0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d',
              decimals: 18,
              name: 'FOX',
            },
          },
        },
        receive: {},
      }

      const actual = await parseTx(txMempool, address)

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

      const expected: ParseTx = {
        ...tx,
        address: address,
        fee: {
          value: '26926494400000000',
          symbol: 'ETH',
        },
        send: {
          ETH: {
            totalValue: '42673718176645189',
            components: [{ value: '42673718176645189' }],
          },
          FOX: {
            totalValue: '100000000000000000000',
            components: [{ value: '100000000000000000000' }],
            token: foxToken,
          },
        },
        receive: {
          'UNI-V2': {
            totalValue: '1888842410762840601',
            components: [{ value: '1888842410762840601' }],
            token: uniV2Token,
          },
        },
      }

      const actual = await parseTx(tx, address)

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

      const expected: ParseTx = {
        ...txMempool,
        address: address,
        send: {
          'UNI-V2': {
            totalValue: '298717642142382954',
            components: [{ value: '298717642142382954' }],
            token: uniV2Token,
          },
        },
        receive: {},
      }

      const actual = await parseTx(txMempool, address)

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

      const expected: ParseTx = {
        ...tx,
        address: address,
        fee: {
          value: '4082585000000000',
          symbol: 'ETH',
        },
        send: {
          'UNI-V2': {
            totalValue: '298717642142382954',
            components: [{ value: '298717642142382954' }],
            token: uniV2Token,
          },
        },
        receive: {
          ETH: {
            totalValue: '6761476182340434',
            components: [{ value: '6761476182340434' }],
          },
          FOX: {
            totalValue: '15785079906515930982',
            components: [{ value: '15785079906515930982' }],
            token: foxToken,
          },
        },
      }

      const actual = await parseTx(tx, address, internalTxs)

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

      const expected: ParseTx = {
        ...tx,
        address: address,
        fee: {
          value: '2559843000000000',
          symbol: 'ETH',
        },
        send: {},
        receive: {
          FOX: {
            totalValue: '1500000000000000000000',
            components: [{ value: '1500000000000000000000' }],
            token: foxToken,
          },
        },
      }

      const actual = await parseTx(tx, address)

      expect(expected).toEqual(actual)
    })

    // TODO: parse pending LP Token send to staking contract using stake() contract call
    it('should be able to parse stake mempool', async () => {
      const { txMempool } = foxStake
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: ParseTx = {
        ...txMempool,
        address: address,
        send: {},
        receive: {},
      }

      const actual = await parseTx(txMempool, address)

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

      const expected: ParseTx = {
        ...tx,
        address: address,
        fee: {
          value: '4650509500000000',
          symbol: 'ETH',
        },
        send: {
          'UNI-V2': {
            totalValue: '99572547380794318',
            components: [{ value: '99572547380794318' }],
            token: uniV2Token,
          },
        },
        receive: {},
      }

      const actual = await parseTx(tx, address)

      expect(expected).toEqual(actual)
    })

    it('should be able to parse exit mempool', async () => {
      const { txMempool } = foxExit
      const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

      const expected: ParseTx = {
        ...txMempool,
        address: address,
        send: {},
        receive: {},
      }

      const actual = await parseTx(txMempool, address)

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

      const expected: ParseTx = {
        ...tx,
        address: address,
        fee: {
          value: '6136186875000000',
          symbol: 'ETH',
        },
        send: {},
        receive: {
          FOX: {
            totalValue: '317669338073988',
            components: [{ value: '317669338073988' }],
            token: foxToken,
          },
          'UNI-V2': {
            totalValue: '531053586030903030',
            components: [{ value: '531053586030903030' }],
            token: uniV2Token,
          },
        },
      }

      const actual = await parseTx(tx, address)

      expect(expected).toEqual(actual)
    })
  })
})
