import { InlineResponse200 } from '../generated/midgard'

export default {
  swap: {
    '8C859BA50BC2351797F52F954971E1C6BA1F0A77610AC197BD99C4EEC6A3692A': {
      actions: [
        {
          date: '1622494265172776247',
          height: '800440',
          in: [
            {
              address: '0x5a8c5afbcc1a58ccbe17542957b587f46828b38e',
              coins: [
                {
                  amount: '417377389800',
                  asset: 'ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48',
                },
              ],
              txID: '8C859BA50BC2351797F52F954971E1C6BA1F0A77610AC197BD99C4EEC6A3692A',
            },
          ],
          metadata: {
            swap: {
              liquidityFee: '70840351',
              networkFees: [
                {
                  amount: '960000',
                  asset: 'ETH.ETH',
                },
              ],
              swapSlip: '21',
              swapTarget: '151020111',
            },
          },
          out: [
            {
              address: '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E',
              coins: [
                {
                  amount: '157972709',
                  asset: 'ETH.ETH',
                },
              ],
              txID: '77B3683104413AFCF8548DD949EBB99A6C18FB7D459BF944733FD815C98E5087',
            },
          ],
          pools: ['ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48', 'ETH.ETH'],
          status: 'success',
          type: 'swap',
        },
      ],
      count: '1',
    },
    F3AC4E90AB5951AB9FEB1715B481422B904A40B0F6753CC844E326B1213CF70E: {
      actions: [
        {
          date: '1621613224878658002',
          height: '642927',
          in: [
            {
              address: 'thor1hhjupkzy3t6ccelhz7qw8epyx4rm8a06nlm5ce',
              coins: [
                {
                  amount: '510423341825',
                  asset: 'THOR.RUNE',
                },
              ],
              txID: 'F3AC4E90AB5951AB9FEB1715B481422B904A40B0F6753CC844E326B1213CF70E',
            },
          ],
          metadata: {
            swap: {
              liquidityFee: '11745645806',
              networkFees: [
                {
                  amount: '17751276300',
                  asset: 'ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48',
                },
                {
                  amount: '17751276300',
                  asset: 'ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48',
                },
              ],
              swapSlip: '236',
              swapTarget: '5292633914111',
            },
          },
          out: [
            {
              address: '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E',
              coins: [
                {
                  amount: '4759647164000',
                  asset: 'ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48',
                },
              ],
              txID: '21C32222D4A9E2A876CDF5B2548B5186D6AC871028E3497525A44D99743AAE7D',
            },
            {
              address: '0x5a8C5afbCC1A58cCbe17542957b587F46828B38E',
              coins: [
                {
                  amount: '776064477500',
                  asset: 'ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48',
                },
              ],
              txID: '43548D7F9D95983C8D956FA98EE1DB1AF326C9E5943C47F747DF06DDB7742C25',
            },
          ],
          pools: ['ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48'],
          status: 'success',
          type: 'swap',
        },
      ],
      count: '1',
    },
  },
  refund: {
    '851B4997CF8F9FBA806B3780E0C178CCB173AE78E3FD5056F7375B059B22BD3A': {
      actions: [
        {
          date: '1623293293190513791',
          height: '942854',
          in: [
            {
              address: '0xfc0cc6e85dff3d75e3985e0cb83b090cfd498dd1',
              coins: [
                {
                  amount: '1361273',
                  asset: 'ETH.ETH',
                },
              ],
              txID: '851B4997CF8F9FBA806B3780E0C178CCB173AE78E3FD5056F7375B059B22BD3A',
            },
          ],
          metadata: {
            refund: {
              networkFees: [
                {
                  amount: '720000',
                  asset: 'ETH.ETH',
                },
              ],
              reason: 'fail swap, not enough fee',
            },
          },
          out: [
            {
              address: '0xfc0Cc6E85dFf3D75e3985e0CB83B090cfD498dd1',
              coins: [
                {
                  amount: '641273',
                  asset: 'ETH.ETH',
                },
              ],
              txID: 'A1E6D3CD2E4C5BC06AF21835065A44EB2D207962EBF36B9E24A366EB20E906DA',
            },
          ],
          pools: [],
          status: 'success',
          type: 'refund',
        },
      ],
      count: '1',
    },
    badCount: {
      actions: [
        {
          date: '',
          height: '',
          in: [],
          metadata: { refund: { networkFees: [], reason: '' } },
          out: [],
          pools: [],
          status: 'success',
          type: 'refund',
        },
      ],
      count: '0',
    },
    nonSuccess: {
      actions: [
        {
          date: '',
          height: '',
          in: [],
          metadata: { refund: { networkFees: [], reason: '' } },
          out: [],
          pools: [],
          status: 'pending',
          type: 'refund',
        },
      ],
      count: '1',
    },
  },
} as Record<string, Record<string, InlineResponse200>>
