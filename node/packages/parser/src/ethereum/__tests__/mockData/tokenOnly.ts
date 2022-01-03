export default {
  txMempool: {
    txid: '0x7e7e25ecd97047321431ac03fdc88c09841c48505ed67414a6c431a880a9e789',
    vin: [
      {
        n: 0,
        addresses: ['0x48c04ed5691981C42154C6167398f95e8f38a7fF'],
        isAddress: true,
      },
    ],
    vout: [
      {
        value: '0',
        n: 0,
        addresses: ['0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0'],
        isAddress: true,
      },
    ],
    blockHeight: -1,
    confirmations: 0,
    blockTime: 1624049471,
    value: '0',
    fees: '0',
    rbf: true,
    coinSpecificData: {
      tx: {
        nonce: '0x10c11',
        gasPrice: '0x699182460',
        gas: '0x2bf20',
        to: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
        value: '0x0',
        input:
          '0xa9059cbb0000000000000000000000006eb9003ee9f154e204a7e2e004ee52bb0f0ab23e0000000000000000000000000000000000000000000000004c59062aa2d48000',
        hash: '0x7e7e25ecd97047321431ac03fdc88c09841c48505ed67414a6c431a880a9e789',
        blockNumber: '',
        from: '0x48c04ed5691981C42154C6167398f95e8f38a7fF',
        transactionIndex: '',
      },
    },
    tokenTransfers: [
      {
        type: 'ERC20',
        from: '0x48c04ed5691981C42154C6167398f95e8f38a7fF',
        to: '0x6eb9003Ee9F154e204a7e2E004ee52bB0f0Ab23E',
        token: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
        name: 'Matic Token',
        symbol: 'MATIC',
        decimals: 18,
        value: '5501435200000000000',
      },
    ],
    ethereumSpecific: {
      status: -1,
      nonce: 68625,
      gasLimit: 180000,
      gasUsed: null,
      gasPrice: '28338300000',
      data:
        '0xa9059cbb0000000000000000000000006eb9003ee9f154e204a7e2e004ee52bb0f0ab23e0000000000000000000000000000000000000000000000004c59062aa2d48000',
    },
  },
  tx: {
    txid: '0x29077583093eedabf886708cc84857ec681a280b8cb07431569f33a538e904ef',
    vin: [
      {
        n: 0,
        addresses: ['0x51f360dA50a346157a2a906600F4834b1d5bAF6b'],
        isAddress: true,
      },
    ],
    vout: [
      {
        value: '0',
        n: 0,
        addresses: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
        isAddress: true,
      },
    ],
    blockHash: '0x39fbd8a96a5b519ea5301ecde6dbf2c63c4a767a3368586ca4c5165ef0999af3',
    blockHeight: 12659161,
    confirmations: 141,
    blockTime: 1624029849,
    value: '0',
    fees: '2571189000000000',
    tokenTransfers: [
      {
        type: 'ERC20',
        from: '0x51f360dA50a346157a2a906600F4834b1d5bAF6b',
        to: '0x5041ed759Dd4aFc3a72b8192C143F72f4724081A',
        token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        value: '376000000',
      },
    ],
    ethereumSpecific: {
      status: 1,
      nonce: 5,
      gasLimit: 105000,
      gasUsed: 48513,
      gasPrice: '53000000000',
      data:
        '0xa9059cbb0000000000000000000000005041ed759dd4afc3a72b8192c143f72f4724081a0000000000000000000000000000000000000000000000000000000016694e00',
    },
  },
}
