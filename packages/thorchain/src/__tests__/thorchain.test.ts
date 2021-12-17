import { Thorchain } from '../index'

jest.mock('../index')

const thorchain = new Thorchain({ midgardUrl: 'test', rpcUrl: 'test' })

describe('thorchain', () => {
  describe('getTxDetails', () => {
    describe('swap', () => {
      it('should be able to get swap details for token -> eth', async () => {
        const expected = {
          fee: {
            amount: '9600000000000000',
            asset: 'ETH',
            network: 'ETH',
          },
          input: {
            amount: '4173773898',
            asset: 'USDC',
            contractAddress: '0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48',
            network: 'ETH',
          },
          liquidityFee: '70840351',
          output: {
            amount: '1579727090000000000',
            asset: 'ETH',
            network: 'ETH',
          },
        }

        const actual = await thorchain.getTxDetails(
          '8C859BA50BC2351797F52F954971E1C6BA1F0A77610AC197BD99C4EEC6A3692A',
          'swap'
        )

        expect(actual).toEqual(expected)
      })

      it('should be able to get swap details for non eth network -> token', async () => {
        const expected = {
          fee: {
            amount: '355025526',
            asset: 'USDC',
            contractAddress: '0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48',
            network: 'ETH',
          },
          input: {
            amount: '510423341825',
            asset: 'RUNE',
            network: 'THOR',
          },
          liquidityFee: '11745645806',
          output: {
            amount: '47596471640',
            asset: 'USDC',
            contractAddress: '0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48',
            network: 'ETH',
          },
        }

        const actual = await thorchain.getTxDetails(
          'F3AC4E90AB5951AB9FEB1715B481422B904A40B0F6753CC844E326B1213CF70E',
          'swap'
        )

        expect(actual).toEqual(expected)
      })
    })

    describe('refund', () => {
      it('should be able to get refund details for attempted eth swap', async () => {
        const expected = {
          fee: {
            amount: '7200000000000000',
            asset: 'ETH',
            network: 'ETH',
          },
          input: {
            amount: '13612730000000000',
            asset: 'ETH',
            network: 'ETH',
          },
          output: {
            amount: '6412730000000000',
            asset: 'ETH',
            network: 'ETH',
          },
        }

        const actual = await thorchain.getTxDetails(
          '851B4997CF8F9FBA806B3780E0C178CCB173AE78E3FD5056F7375B059B22BD3A',
          'refund'
        )

        expect(actual).toEqual(expected)
      })
    })

    describe('errors', () => {
      it('should throw on non 200 response', async () => {
        const actual = thorchain.getTxDetails('non200', 'swap')

        await expect(actual).rejects.toThrow('non 200 response')
      })

      it('should throw on incorrect action count', async () => {
        const actual = thorchain.getTxDetails('badCount', 'refund')

        await expect(actual).rejects.toThrow('expected actions: 1')
      })

      it('should throw on non success status', async () => {
        const actual = thorchain.getTxDetails('nonSuccess', 'refund')

        await expect(actual).rejects.toThrow('unable to parse')
      })
    })
  })
})
