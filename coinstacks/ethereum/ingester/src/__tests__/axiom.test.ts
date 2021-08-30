import { parseTx } from '../parseTx'
import { format, AxiomTx } from '../workers/axiom'
import ethOnly from './__mocks__/ethOnly'
import tokenOnly from './__mocks__/tokenOnly'
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
import uniRemoveLiquidity from './__mocks__/uniRemoveLiquidity'
import foxClaim from './__mocks__/foxClaim'
import foxExit from './__mocks__/foxExit'
import foxStake from './__mocks__/foxStake'
import uniAddLiquidity from './__mocks__/uniAddLiquidity'

jest.mock('@shapeshiftoss/thorchain')

jest.mock('@shapeshiftoss/common-ingester', () => ({
  Worker: {
    init: () => ({
      queue: {
        prefetch: jest.fn(),
        activateConsumer: jest.fn(),
      },
    }),
  },
}))

describe('axiomWorker', () => {
  describe('format', () => {
    describe('standard', () => {
      it('should be able to format an eth send', async () => {
        const { tx } = ethOnly
        const address = '0x8C8D7C46219D9205f056f28fee5950aD564d7465'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-47274000000000000',
            balance_units: 'wei',
            blockheight: 12659161,
            blocktime: 1624029849,
            confirmations: 14,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0x5557426ee8e2f3da4703a4b5ab265e5d3a5626da1f69b4d048c7230a75fa5936',
            type: 'send',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format an eth send mempool', async () => {
        const { txMempool } = ethOnly
        const address = '0x70336A5A868cF9E0a9D1B47fbE1F521aD6C5C364'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-100295077000000000',
            balance_units: 'wei',
            blockheight: -1,
            blocktime: 1624048855,
            confirmations: 0,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0xc3acd7001e1d01fe4b451e33e24ce399ee533a18d00b441e3bb6290209b072e1',
            type: 'send',
          },
        ]

        const pTx = await parseTx(txMempool, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format an eth receive', async () => {
        const { tx } = ethOnly
        const address = '0x05EFB6161fe280dC17E5f9EaB6200b889E2D0A88'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '46224000000000000',
            balance_units: 'wei',
            blockheight: 12659161,
            blocktime: 1624029849,
            confirmations: 14,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0x5557426ee8e2f3da4703a4b5ab265e5d3a5626da1f69b4d048c7230a75fa5936',
            type: 'receive',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format an eth receive mempool', async () => {
        const { txMempool } = ethOnly
        const address = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '100295077000000000',
            balance_units: 'wei',
            blockheight: -1,
            blocktime: 1624048855,
            confirmations: 0,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0xc3acd7001e1d01fe4b451e33e24ce399ee533a18d00b441e3bb6290209b072e1',
            type: 'receive',
          },
        ]

        const pTx = await parseTx(txMempool, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format a token send', async () => {
        const { tx } = tokenOnly
        const address = '0x51f360dA50a346157a2a906600F4834b1d5bAF6b'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-2571189000000000',
            balance_units: 'wei',
            blockheight: 12659161,
            blocktime: 1624029849,
            confirmations: 141,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0x29077583093eedabf886708cc84857ec681a280b8cb07431569f33a538e904ef',
            type: 'fee',
          },
          {
            source: 'unchained',
            balance_change: '-376000000',
            balance_units: 'wei',
            blockheight: 12659161,
            blocktime: 1624029849,
            confirmations: 141,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'USDC',
            txid: '0x29077583093eedabf886708cc84857ec681a280b8cb07431569f33a538e904ef',
            type: 'send',
            token_contract_address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            token_decimals: 6,
            token_name: 'USD Coin',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format a token send mempool', async () => {
        const { txMempool } = tokenOnly
        const address = '0x48c04ed5691981C42154C6167398f95e8f38a7fF'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-5501435200000000000',
            balance_units: 'wei',
            blockheight: -1,
            blocktime: 1624049471,
            confirmations: 0,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'MATIC',
            txid: '0x7e7e25ecd97047321431ac03fdc88c09841c48505ed67414a6c431a880a9e789',
            type: 'send',
            token_contract_address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
            token_decimals: 18,
            token_name: 'Matic Token',
          },
        ]

        const pTx = await parseTx(txMempool, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format a token receive', async () => {
        const { tx } = tokenOnly
        const address = '0x5041ed759Dd4aFc3a72b8192C143F72f4724081A'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '376000000',
            balance_units: 'wei',
            blockheight: 12659161,
            blocktime: 1624029849,
            confirmations: 141,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'USDC',
            txid: '0x29077583093eedabf886708cc84857ec681a280b8cb07431569f33a538e904ef',
            type: 'receive',
            token_contract_address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            token_decimals: 6,
            token_name: 'USD Coin',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format a token receive mempool', async () => {
        const { txMempool } = tokenOnly
        const address = '0x6eb9003Ee9F154e204a7e2E004ee52bB0f0Ab23E'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '5501435200000000000',
            balance_units: 'wei',
            blockheight: -1,
            blocktime: 1624049471,
            confirmations: 0,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'MATIC',
            txid: '0x7e7e25ecd97047321431ac03fdc88c09841c48505ed67414a6c431a880a9e789',
            type: 'receive',
            token_contract_address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
            token_decimals: 18,
            token_name: 'Matic Token',
          },
        ]

        const pTx = await parseTx(txMempool, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })
    })

    describe('thor', () => {
      it('should be able to format a thor swap deposit eth', async () => {
        const { tx } = thorSwapDepositEth
        const address = '0xCeb660E7623E8f8312B3379Df747c35f2217b595'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-296740235000000000',
            balance_units: 'wei',
            blockheight: 12563350,
            blocktime: 1622747859,
            confirmations: 830,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0xee6d63be925e90e4894288dc32d593ef6ab14c497973cb722a408fa606d42d64',
            type: 'send',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format a thor swap deposit token', async () => {
        const { tx } = thorSwapDepositUsdc
        const address = '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-4700280000000000',
            balance_units: 'wei',
            blockheight: 12518044,
            blocktime: 1622141232,
            confirmations: 45680,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0xc88ccc23a6d5b23b67a093aa3f3c58416af34bb45f169b9e97a84fec2d15de87',
            type: 'fee',
          },
          {
            source: 'unchained',
            balance_change: '-16598881497',
            balance_units: 'wei',
            blockheight: 12518044,
            blocktime: 1622141232,
            confirmations: 45680,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'USDC',
            txid: '0xc88ccc23a6d5b23b67a093aa3f3c58416af34bb45f169b9e97a84fec2d15de87',
            type: 'send',
            token_contract_address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            token_decimals: 6,
            token_name: 'USD Coin',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format a thor swap transfer out eth', async () => {
        const { tx, internalTxs } = thorSwapTransferOutEth
        const address = '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '1579727090000000000',
            balance_units: 'wei',
            blockheight: 12544372,
            blocktime: 1622494272,
            confirmations: 19507,
            is_dex_trade: false,
            is_thor_trade: true,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0x77b3683104413afcf8548dd949ebb99a6c18fb7d459bf944733fd815c98e5087',
            type: 'receive',
            buy_asset: 'ETH',
            buy_asset_amount: '1579727090000000000',
            buy_asset_network: 'ETH',
            fee_asset: 'ETH',
            fee_network: 'ETH',
            network_fee: '9600000000000000',
            liquidity_fee: '70840351',
            sell_asset: 'USDC',
            sell_asset_amount: '4173773898',
            sell_asset_network: 'ETH',
            thor_memo: 'OUT:8C859BA50BC2351797F52F954971E1C6BA1F0A77610AC197BD99C4EEC6A3692A',
          },
        ]

        const pTx = await parseTx(tx, address, internalTxs)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format a thor swap transfer out token', async () => {
        const { tx } = thorSwapTransferOutUsdc
        const address = '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '47596471640',
            balance_units: 'wei',
            blockheight: 12478650,
            blocktime: 1621613233,
            confirmations: 85265,
            is_dex_trade: false,
            is_thor_trade: true,
            network: 'ETH',
            success: true,
            symbol: 'USDC',
            txid: '0x21c32222d4a9e2a876cdf5b2548b5186d6ac871028e3497525a44d99743aae7d',
            type: 'receive',
            token_contract_address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            token_decimals: 6,
            token_name: 'USD Coin',
            buy_asset: 'USDC',
            buy_asset_amount: '47596471640',
            buy_asset_network: 'ETH',
            fee_asset: 'USDC',
            fee_network: 'ETH',
            network_fee: '355025526',
            liquidity_fee: '11745645806',
            sell_asset: 'RUNE',
            sell_asset_amount: '510423341825',
            sell_asset_network: 'THOR',
            thor_memo: 'OUT:F3AC4E90AB5951AB9FEB1715B481422B904A40B0F6753CC844E326B1213CF70E',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format a thor refund of eth', async () => {
        const { tx, internalTxs } = thorSwapRefundEth
        const address = '0xfc0Cc6E85dFf3D75e3985e0CB83B090cfD498dd1'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '6412730000000000',
            balance_units: 'wei',
            blockheight: 12604164,
            blocktime: 1623293292,
            confirmations: 183654,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0xa1e6d3cd2e4c5bc06af21835065a44eb2d207962ebf36b9e24a366eb20e906da',
            type: 'receive',
            buy_asset: 'ETH',
            buy_asset_amount: '6412730000000000',
            buy_asset_network: 'ETH',
            thor_memo: 'REFUND:851B4997CF8F9FBA806B3780E0C178CCB173AE78E3FD5056F7375B059B22BD3A',
          },
        ]

        const pTx = await parseTx(tx, address, internalTxs)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })
    })

    describe('zrx', () => {
      it('should be able to format a zrx eth -> token trade', async () => {
        const { tx } = zrxTradeEthToMatic
        const address = '0x564BcA365D62BCC22dB53d032F8dbD35439C9206'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-10019815285000000000',
            balance_units: 'wei',
            blockheight: 12318119,
            blocktime: 1619468728,
            confirmations: 25269,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0xafb23138b363eeb2a89f6683e229ace5bbe2c050de8e34c38ed527d4571f13aa',
            type: 'send',
          },
          {
            source: 'unchained',
            balance_change: '50000000000000000000000',
            balance_units: 'wei',
            blockheight: 12318119,
            blocktime: 1619468728,
            confirmations: 25269,
            is_dex_trade: true,
            network: 'ETH',
            success: true,
            symbol: 'MATIC',
            txid: '0xafb23138b363eeb2a89f6683e229ace5bbe2c050de8e34c38ed527d4571f13aa',
            type: 'receive',
            token_contract_address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
            token_decimals: 18,
            token_name: 'Matic Token',
            buy_asset: 'MATIC',
            buy_asset_amount: '50000000000000000000000',
            fee_asset: 'ETH',
            network_fee: '19815285000000000',
            sell_asset: 'ETH',
            sell_asset_amount: '10000000000000000000',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format a zrx token -> eth trade', async () => {
        const { tx, internalTxs } = zrxTradeTribeToEth
        const address = '0x5bb96c35a68Cba037D0F261C67477416db137F03'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-8308480000000000',
            balance_units: 'wei',
            blockheight: 12323213,
            blocktime: 1619537079,
            confirmations: 20072,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0xcb4c224c9843289957c95519811225ab6ada773c9e1faafb30ace0193ff6e3f9',
            type: 'fee',
          },
          {
            source: 'unchained',
            balance_change: '-1000000000000000000000',
            balance_units: 'wei',
            blockheight: 12323213,
            blocktime: 1619537079,
            confirmations: 20072,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'TRIBE',
            txid: '0xcb4c224c9843289957c95519811225ab6ada773c9e1faafb30ace0193ff6e3f9',
            type: 'send',
            token_contract_address: '0xc7283b66Eb1EB5FB86327f08e1B5816b0720212B',
            token_decimals: 18,
            token_name: 'Tribe',
          },
          {
            source: 'unchained',
            balance_change: '541566754246167133',
            balance_units: 'wei',
            blockheight: 12323213,
            blocktime: 1619537079,
            confirmations: 20072,
            is_dex_trade: true,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0xcb4c224c9843289957c95519811225ab6ada773c9e1faafb30ace0193ff6e3f9',
            type: 'receive',
            buy_asset: 'ETH',
            buy_asset_amount: '541566754246167133',
            fee_asset: 'ETH',
            network_fee: '8308480000000000',
            sell_asset: 'TRIBE',
            sell_asset_amount: '1000000000000000000000',
          },
        ]

        const pTx = await parseTx(tx, address, internalTxs)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format a zrx token -> token trade', async () => {
        const { tx } = zrxTradeTetherToKishu
        const address = '0xb8b19c048296E086DaF69F54d48dE2Da444dB047'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-78183644000000000',
            balance_units: 'wei',
            blockheight: 12408996,
            blocktime: 1620680747,
            confirmations: 22,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0x7ae99994cc2630db20646cc3454cb8c84397862db0f9f67735cf8a2053c7a144',
            type: 'fee',
          },
          {
            source: 'unchained',
            balance_change: '-45000000000',
            balance_units: 'wei',
            blockheight: 12408996,
            blocktime: 1620680747,
            confirmations: 22,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'USDT',
            txid: '0x7ae99994cc2630db20646cc3454cb8c84397862db0f9f67735cf8a2053c7a144',
            type: 'send',
            token_contract_address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            token_decimals: 6,
            token_name: 'Tether USD',
          },
          {
            source: 'unchained',
            balance_change: '9248567698016204727450',
            balance_units: 'wei',
            blockheight: 12408996,
            blocktime: 1620680747,
            confirmations: 22,
            is_dex_trade: true,
            network: 'ETH',
            success: true,
            symbol: 'KISHU',
            txid: '0x7ae99994cc2630db20646cc3454cb8c84397862db0f9f67735cf8a2053c7a144',
            type: 'receive',
            token_contract_address: '0xA2b4C0Af19cC16a6CfAcCe81F192B024d625817D',
            token_decimals: 9,
            token_name: 'Kishu Inu',
            buy_asset: 'KISHU',
            buy_asset_amount: '9248567698016204727450',
            fee_asset: 'ETH',
            network_fee: '78183644000000000',
            sell_asset: 'USDT',
            sell_asset_amount: '45000000000',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format a zrx token -> token trade (multiple swaps)', async () => {
        const { tx } = zrxTradeBondToUni
        const address = '0x986bB494db49E6f1CDC1be098e3157f8DDC5a821'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-18399681000000000',
            balance_units: 'wei',
            blockheight: 12389489,
            blocktime: 1620421294,
            confirmations: 135,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0x8756b3293bb4968478f7638e4d63d3c42f718e91cd2fc1dbb07d846b834cc5d4',
            type: 'fee',
          },
          {
            source: 'unchained',
            balance_change: '-100000000000000000000',
            balance_units: 'wei',
            blockheight: 12389489,
            blocktime: 1620421294,
            confirmations: 135,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'BOND',
            txid: '0x8756b3293bb4968478f7638e4d63d3c42f718e91cd2fc1dbb07d846b834cc5d4',
            type: 'send',
            token_contract_address: '0x0391D2021f89DC339F60Fff84546EA23E337750f',
            token_decimals: 18,
            token_name: 'BarnBridge Governance Token',
          },
          {
            source: 'unchained',
            balance_change: '104088257588936074249',
            balance_units: 'wei',
            blockheight: 12389489,
            blocktime: 1620421294,
            confirmations: 135,
            is_dex_trade: true,
            network: 'ETH',
            success: true,
            symbol: 'UNI',
            txid: '0x8756b3293bb4968478f7638e4d63d3c42f718e91cd2fc1dbb07d846b834cc5d4',
            type: 'receive',
            token_contract_address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
            token_decimals: 18,
            token_name: 'Uniswap',
            buy_asset: 'UNI',
            buy_asset_amount: '104088257588936074249',
            fee_asset: 'ETH',
            network_fee: '18399681000000000',
            sell_asset: 'BOND',
            sell_asset_amount: '100000000000000000000',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })
    })

    describe('self send', () => {
      it('should be able to format an eth mempool self send', async () => {
        const { txMempool } = ethSelfSend
        const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

        const expected: Array<AxiomTx> = []

        const pTx = await parseTx(txMempool, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format an eth self send', async () => {
        const { tx } = ethSelfSend
        const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-399000000000000',
            balance_units: 'wei',
            blockheight: 12697941,
            blocktime: 1624552745,
            confirmations: 90665,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0x854dff9231cadb562129cff006150dfc6dd1508ea2a39c9b51292d234c47a992',
            type: 'fee',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format a token mempool self send', async () => {
        const { txMempool } = tokenSelfSend
        const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

        const expected: Array<AxiomTx> = []

        const pTx = await parseTx(txMempool, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to format a token self send', async () => {
        const { tx } = tokenSelfSend
        const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-1011738000000000',
            balance_units: 'wei',
            blockheight: 12697967,
            blocktime: 1624553243,
            confirmations: 90639,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0xa9e0f831d57140cde9f40d8a1fac2342642f982190428618dc6b0c1c334069da',
            type: 'fee',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })
    })

    describe('uniswap', () => {
      it('should be able to parse approve', async () => {
        const { tx } = uniApprove
        const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-1447243200000000',
            balance_units: 'wei',
            blockheight: 12834358,
            blocktime: 1626389853,
            confirmations: 44093,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0x86ff94a00efcf81cbba1b04c3f985786a23fe39cfc99bceb740cfddd6344e4ca',
            type: 'fee',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to parse add liquidity mempool', async () => {
        const { txMempool } = uniAddLiquidity
        const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-100000000000000000000',
            balance_units: 'wei',
            blockheight: -1,
            blocktime: 1626988786,
            confirmations: 0,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'FOX',
            token_contract_address: '0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d',
            token_decimals: 18,
            token_name: 'FOX',
            txid: '0x209a3be2278e7de0e9cbb380abd9321eb07c42443b984e2d988babc0e3ab8fa3',
            type: 'send',
          },
          {
            source: 'unchained',
            balance_change: '-42673718176645189',
            balance_units: 'wei',
            blockheight: -1,
            blocktime: 1626988786,
            confirmations: 0,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0x209a3be2278e7de0e9cbb380abd9321eb07c42443b984e2d988babc0e3ab8fa3',
            type: 'send',
          },
        ]

        const pTx = await parseTx(txMempool, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to parse add liquidity', async () => {
        const { tx } = uniAddLiquidity
        const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-69600212576645189',
            balance_units: 'wei',
            blockheight: 12878550,
            blocktime: 1626988783,
            confirmations: 2,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0x209a3be2278e7de0e9cbb380abd9321eb07c42443b984e2d988babc0e3ab8fa3',
            type: 'send',
          },
          {
            source: 'unchained',
            balance_change: '-100000000000000000000',
            balance_units: 'wei',
            blockheight: 12878550,
            blocktime: 1626988783,
            confirmations: 2,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'FOX',
            token_contract_address: '0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d',
            token_decimals: 18,
            token_name: 'FOX',
            txid: '0x209a3be2278e7de0e9cbb380abd9321eb07c42443b984e2d988babc0e3ab8fa3',
            type: 'send',
          },
          {
            source: 'unchained',
            balance_change: '1888842410762840601',
            balance_units: 'wei',
            blockheight: 12878550,
            blocktime: 1626988783,
            confirmations: 2,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'UNI-V2',
            token_contract_address: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
            token_decimals: 18,
            token_name: 'Uniswap V2',
            txid: '0x209a3be2278e7de0e9cbb380abd9321eb07c42443b984e2d988babc0e3ab8fa3',
            type: 'receive',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to parse remove liquidity mempool', async () => {
        const { txMempool } = uniRemoveLiquidity
        const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-298717642142382954',
            balance_units: 'wei',
            blockheight: -1,
            blocktime: 1626987218,
            confirmations: 0,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'UNI-V2',
            token_contract_address: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
            token_decimals: 18,
            token_name: 'Uniswap V2',
            txid: '0xfc193dfb8a3c792cf36491db174f3aba88b598e586b968e8bc55e9b5560d69df',
            type: 'send',
          },
        ]

        const pTx = await parseTx(txMempool, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to parse remove liquidity', async () => {
        const { tx, internalTxs } = uniRemoveLiquidity
        const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-4082585000000000',
            balance_units: 'wei',
            blockheight: 12878436,
            blocktime: 1626987201,
            confirmations: 7,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0xfc193dfb8a3c792cf36491db174f3aba88b598e586b968e8bc55e9b5560d69df',
            type: 'fee',
          },
          {
            source: 'unchained',
            balance_change: '-298717642142382954',
            balance_units: 'wei',
            blockheight: 12878436,
            blocktime: 1626987201,
            confirmations: 7,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'UNI-V2',
            token_contract_address: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
            token_decimals: 18,
            token_name: 'Uniswap V2',
            txid: '0xfc193dfb8a3c792cf36491db174f3aba88b598e586b968e8bc55e9b5560d69df',
            type: 'send',
          },
          {
            source: 'unchained',
            balance_change: '15785079906515930982',
            balance_units: 'wei',
            blockheight: 12878436,
            blocktime: 1626987201,
            confirmations: 7,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'FOX',
            token_contract_address: '0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d',
            token_decimals: 18,
            token_name: 'FOX',
            txid: '0xfc193dfb8a3c792cf36491db174f3aba88b598e586b968e8bc55e9b5560d69df',
            type: 'receive',
          },
          {
            source: 'unchained',
            balance_change: '6761476182340434',
            balance_units: 'wei',
            blockheight: 12878436,
            blocktime: 1626987201,
            confirmations: 7,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0xfc193dfb8a3c792cf36491db174f3aba88b598e586b968e8bc55e9b5560d69df',
            type: 'receive',
          },
        ]

        const pTx = await parseTx(tx, address, internalTxs)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })
    })

    describe('fox', () => {
      it('should be able to parse claim', async () => {
        const { tx } = foxClaim
        const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-2559843000000000',
            balance_units: 'wei',
            blockheight: 12834280,
            blocktime: 1626388931,
            confirmations: 43853,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0xbe01638e9d918c3594c5273ba026ddad63741ecf442116fa85b95b1bc64eb61c',
            type: 'fee',
          },
          {
            source: 'unchained',
            balance_change: '1500000000000000000000',
            balance_units: 'wei',
            blockheight: 12834280,
            blocktime: 1626388931,
            confirmations: 43853,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'FOX',
            token_contract_address: '0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d',
            token_decimals: 18,
            token_name: 'FOX',
            txid: '0xbe01638e9d918c3594c5273ba026ddad63741ecf442116fa85b95b1bc64eb61c',
            type: 'receive',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to parse stake mempool', async () => {
        const { txMempool } = foxStake
        const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

        const expected: Array<AxiomTx> = []

        const pTx = await parseTx(txMempool, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to parse stake', async () => {
        const { tx } = foxStake
        const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-4650509500000000',
            balance_units: 'wei',
            blockheight: 12878348,
            blocktime: 1626986096,
            confirmations: 2,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0x253585eae87ebbb6b81c0fa6c6fe3894fb8afb2fb8c7073f7c4b28915aebd2a7',
            type: 'fee',
          },
          {
            source: 'unchained',
            balance_change: '-99572547380794318',
            balance_units: 'wei',
            blockheight: 12878348,
            blocktime: 1626986096,
            confirmations: 2,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'UNI-V2',
            token_contract_address: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
            token_decimals: 18,
            token_name: 'Uniswap V2',
            txid: '0x253585eae87ebbb6b81c0fa6c6fe3894fb8afb2fb8c7073f7c4b28915aebd2a7',
            type: 'send',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to parse exit mempool', async () => {
        const { txMempool } = foxExit
        const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

        const expected: Array<AxiomTx> = []

        const pTx = await parseTx(txMempool, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })

      it('should be able to parse exit', async () => {
        const { tx } = foxExit
        const address = '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C'

        const expected: Array<AxiomTx> = [
          {
            source: 'unchained',
            balance_change: '-6136186875000000',
            balance_units: 'wei',
            blockheight: 12878219,
            blocktime: 1626984360,
            confirmations: 4,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'ETH',
            txid: '0x1c676dd29be457b091e1ecb6578b6614d3f084df610876dfd196e6125fc3f6d6',
            type: 'fee',
          },
          {
            source: 'unchained',
            balance_change: '531053586030903030',
            balance_units: 'wei',
            blockheight: 12878219,
            blocktime: 1626984360,
            confirmations: 4,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'UNI-V2',
            token_contract_address: '0x470e8de2eBaef52014A47Cb5E6aF86884947F08c',
            token_decimals: 18,
            token_name: 'Uniswap V2',
            txid: '0x1c676dd29be457b091e1ecb6578b6614d3f084df610876dfd196e6125fc3f6d6',
            type: 'receive',
          },
          {
            source: 'unchained',
            balance_change: '317669338073988',
            balance_units: 'wei',
            blockheight: 12878219,
            blocktime: 1626984360,
            confirmations: 4,
            is_dex_trade: false,
            network: 'ETH',
            success: true,
            symbol: 'FOX',
            token_contract_address: '0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d',
            token_decimals: 18,
            token_name: 'FOX',
            txid: '0x1c676dd29be457b091e1ecb6578b6614d3f084df610876dfd196e6125fc3f6d6',
            type: 'receive',
          },
        ]

        const pTx = await parseTx(tx, address)
        const actual = format(pTx)

        expect(expected).toEqual(actual)
      })
    })
  })
})
