import { Tx } from '@shapeshiftoss/blockbook'

export const blockbookTxHistory = {
  page: 1,
  totalPages: 1,
  itemsOnPage: 1000,
  address: 'bc1qez4d09qctlfyntfkxl3vgs5unzqpgs29ndyu28',
  balance: '0',
  totalReceived: '1013975',
  totalSent: '1013975',
  unconfirmedBalance: '0',
  unconfirmedTxs: 0,
  txs: 2,
  txids: [
    'b216ba9b329830c2e1b06a76c1cb962e93b7e063606d5e3f0c5ce177ba2f2918',
    '6180934b33620e1b2f6114fa243933b7f71c53a30e4f6c047c7ba195b76a2620',
  ],
}

export const tx: Tx = {
  txid: '6180934b33620e1b2f6114fa243933b7f71c53a30e4f6c047c7ba195b76a2620',
  version: 2,
  lockTime: 701749,
  vin: [
    {
      txid: '4c4af33e9e72ecda7e1dc89d3a7af57d688616e653967e26883f7c3245525152',
      sequence: 4294967294,
      n: 0,
      addresses: ['3PtLYX7hVHSW3riUR7RQ6QdD84WWRNLy7m'],
      isAddress: true,
      value: '176470588',
      hex: '160014bd1c9ae42b4f7008c5ebeae73603cd1dfc3d5ea7',
    },
    {
      txid: '9494df25d432cf3ea43d8d4e44fbba4fce3e1144be4533f6f58383663491177a',
      sequence: 4294967294,
      n: 1,
      addresses: ['bc1qvfxjpqma5xujn7f6g8p4zt6ugm8mptahzd6qgl'],
      isAddress: true,
      value: '1132976',
    },
    {
      txid: '4c4af33e9e72ecda7e1dc89d3a7af57d688616e653967e26883f7c3245525152',
      vout: 15,
      sequence: 4294967294,
      n: 2,
      addresses: ['3E8ca3LpUSoSuSHodQA67xip5dXgTFP2n7'],
      isAddress: true,
      value: '176470588',
      hex: '1600140c532e8594f510da8b0d387f563934861575e844',
    },
    {
      txid: '4c4af33e9e72ecda7e1dc89d3a7af57d688616e653967e26883f7c3245525152',
      vout: 6,
      sequence: 4294967294,
      n: 3,
      addresses: ['3EyCZLb3DMgL1T4D52VVqA4jUDDacnHkYW'],
      isAddress: true,
      value: '176470588',
      hex: '16001437453e98e510a863dd06be9f96d0292ba24cdcf3',
    },
    {
      txid: '4c4af33e9e72ecda7e1dc89d3a7af57d688616e653967e26883f7c3245525152',
      vout: 9,
      sequence: 4294967294,
      n: 4,
      addresses: ['3Ptf82GZdoYuN22vMUwh8js2j8raY3QmTN'],
      isAddress: true,
      value: '176470588',
      hex: '160014b8b72c5943b2cfd9de7d92f48e9fcad01d055de7',
    },
    {
      txid: '4b74bc13129a223bd2abaa4a824ce5f812d75af97c39a3da992e9af9a0da6a2b',
      vout: 14,
      sequence: 4294967294,
      n: 5,
      addresses: ['3CoVbydsm8V21c52XZMquGYZaezp4i5UWg'],
      isAddress: true,
      value: '294117647',
      hex: '160014995cd732c74a3446f1ad35bafbd8d6f79828ef04',
    },
  ],
  vout: [
    {
      value: '1000000000',
      n: 0,
      spent: true,
      hex: 'a91472cd62903f749eb7498de5c490b5a22e61c7589e87',
      addresses: ['3CA2zp8L2g8qz2TQkV4Zf2fwLanBMhmBLB'],
      isAddress: true,
    },
    {
      value: '1013975',
      n: 1,
      spent: true,
      hex: '0014c8aad794185fd249ad3637e2c4429c9880144145',
      addresses: ['bc1qez4d09qctlfyntfkxl3vgs5unzqpgs29ndyu28'],
      isAddress: true,
    },
  ],
  blockHash: '00000000000000000003487798eec68de0bb40b122bce69ae12c9f6e788f9a9b',
  blockHeight: 701750,
  confirmations: 138,
  blockTime: 1632356503,
  value: '1001013975',
  valueIn: '1001132975',
  fees: '119000',
  hex:
    '0200000000010652515245327c3f88267e9653e61686687df57a3a9dc81d7edaec729e3ef34a4c0000000017160014bd1c9ae42b4f7008c5ebeae73603cd1dfc3d5ea7feffffff7a179134668383f5f63345be44113ece4fbafb444e8d3da43ecf32d425df94940000000000feffffff52515245327c3f88267e9653e61686687df57a3a9dc81d7edaec729e3ef34a4c0f000000171600140c532e8594f510da8b0d387f563934861575e844feffffff52515245327c3f88267e9653e61686687df57a3a9dc81d7edaec729e3ef34a4c060000001716001437453e98e510a863dd06be9f96d0292ba24cdcf3feffffff52515245327c3f88267e9653e61686687df57a3a9dc81d7edaec729e3ef34a4c0900000017160014b8b72c5943b2cfd9de7d92f48e9fcad01d055de7feffffff2b6adaa0f99a2e99daa3397cf95ad712f8e54c824aaaabd23b229a1213bc744b0e00000017160014995cd732c74a3446f1ad35bafbd8d6f79828ef04feffffff0200ca9a3b0000000017a91472cd62903f749eb7498de5c490b5a22e61c7589e87d7780f0000000000160014c8aad794185fd249ad3637e2c4429c98801441450247304402201f82dbc684e7dc007c5e76891e44a3e69f4c4976f2b108c76c5f6c31f724619d02207b962733f7dbdda0d2305fac40abc6f936775b82c8093e58c693c5bafc6527ab012102b9f5d2326617d9cb015b61f8bced80f0bf640a19e0d3c1318407d83bc9ea84c202473044022012d01b708b1ec12c4a49fef0ce34ba0a077660feb482bea06a5b978600f86af3022041ba2d7dd848bf6e76be4674e2b24de7c335aa1cfe1f323c7c09b27c8cb616c4012102515aee30f262eaae5d4bbabb32d9ce63bee4c48da36cc649d4283d2c1ef5751e0247304402206effdad8f405384a7aed7128b702957fee5b71c66bbf005b09963f46448e0996022027c15e2010d10b6600f01fa0bc8d7bbf4a926f157568074004f1087d693ed8120121030f0ce1edbf552656ea2ff791d88f84df9d68023fcf000d6a7ee8ecd5dc1e3ed2024730440220699530a33c7c9bbdbc1399b320480b1b2d349f3a4051c76fe413928f9ddf737602201581956e8b286e230279732b2a420fa139d7213ea9fe793c1c00bbc19849f07501210241202dcd1c9a451c4a212f88b10c2bdf2afab7bfbd14b76c2a9078c932dfffeb0247304402203d2acfe57ae0b75f231604c5d92ab54f98198a2ee5ce50aa7d35aa6c03023ca1022037ac23436fecab2c9784d5691f2f530934fe4a07853f5a5923cdc15ebd190c7b012103ad7a479ae2c1a65e5a81284dae6e9192cbee296377d5df5ed33ceb4d384556870247304402204b0be81a5594013407e1b2e0e82f216f8e40bc0b9f3c0891469276c916f07f050220189b299f3adf66a72d8204d29d5bd97d871e7c1b86bdbbcf1329e49a7831e6e501210393c79d23ae89f461f039b895dfd6f365ef5cc89f1a3ef030382f80c2cbd84caa35b50a00',
}

export const db = [
  {
    _id: {
      $oid: '6142bfaf9f5ebde04767b99d',
    },
    client_id: 'unchained',
    ingester_meta: { syncing: { key: null, endTime: 1631764402004, startTime: 0 }, block: 700749 },
    registration: {
      pubkey: 'bc1qez4d09qctlfyntfkxl3vgs5unzqpgs29ndyu28',
      addresses: ['bc1qez4d09qctlfyntfkxl3vgs5unzqpgs29ndyu28'],
    },
  },
]
