import axios, { AxiosInstance } from 'axios'
import { Controller, Example, Get, Path, Query, Route, Tags } from 'tsoa'
import {
  Address,
  ApiError,
  BalanceHistory,
  Block,
  BlockIndex,
  EthereumTxSpecific,
  BitcoinTxSpecific,
  Info,
  SendTx,
  Tx,
  TxSpecific,
  Utxo,
  Xpub,
} from './models'

@Route('api/v2')
@Tags('v2')
export class Blockbook extends Controller {
  instance: AxiosInstance

  constructor(url = 'https://indexer.ethereum.shapeshift.com', timeout?: number) {
    super()
    this.instance = axios.create({
      timeout: timeout ?? 10000,
      baseURL: url,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
  }

  /**
   * Info returns current status of blockbook and connected backend node
   */
  @Example<Info>({
    blockbook: {
      coin: 'Bitcoin',
      host: 'indexer-sts-1',
      version: '0.3.4',
      gitCommit: 'unknown',
      buildTime: 'unknown',
      syncMode: true,
      initialSync: false,
      inSync: true,
      bestHeight: 577261,
      lastBlockTime: '2019-05-22T18:03:33.547762973+02:00',
      inSyncMempool: true,
      lastMempoolTime: '2019-05-22T18:10:10.27929383+02:00',
      mempoolSize: 17348,
      decimals: 8,
      dbSize: 191887866502,
      about: 'Blockbook - blockchain indexer for Trezor wallet https://trezor.io/. Do not use for any other purpose.',
    },
    backend: {
      chain: 'main',
      blocks: 577261,
      headers: 577261,
      bestBlockHash: '0000000000000000000ca8c902aa58b3118a7f35d093e25a07f17bcacd91cabf',
      difficulty: '6704632680587.417',
      sizeOnDisk: 250504188580,
      version: '180000',
      subversion: '/Satoshi:0.18.0/',
      protocolVersion: '70015',
      timeOffset: 0,
      warnings: '',
    },
  })
  @Get('')
  async getInfo(): Promise<Info> {
    try {
      const { data } = await this.instance.get<Info>(`api/v2`)
      return data
    } catch (err) {
      throw new ApiError(err)
    }
  }

  /**
   * Get block hash returns the block hash for a specified block height
   *
   * Examples
   * 1. Ethereum
   *
   * @param height block height
   *
   * @example height 500000
   */
  @Example<BlockIndex>({
    hash: '0xac8e95f7483f7131261bcc0a70873f8236c27444c940defc677f74f281220193',
  })
  @Get('block-index/{height}')
  async getBlockHash(@Path() height: number): Promise<BlockIndex> {
    try {
      const { data } = await this.instance.get<BlockIndex>(`api/v2/block-index/${height}`)
      return data
    } catch (err) {
      throw new ApiError(err)
    }
  }

  /**
   * Get transaction returns "normalized" data about transaction, which has the same general structure for all supported coins.
   * It does not return coin specific fields (for example information about Zcash shielded addresses).
   *
   * Examples:
   * 1. Bitcoin
   * 2. Ethereum
   *
   * @param txid transaction id
   *
   * @example txid "75d18ecf1a785fe7d08c6092e0e57bc6b6c180da317424ed5d38dc82cdfc0966"
   * @example txid "0x890482efd45fcb660b8eebe42ab4d71a24b97c46c7d9c88b1e4b3cf4bef10110"
   */
  @Example<Tx>({
    txid: '75d18ecf1a785fe7d08c6092e0e57bc6b6c180da317424ed5d38dc82cdfc0966',
    version: 1,
    lockTime: 1668727698,
    vin: [
      {
        sequence: 4294967295,
        n: 0,
        isAddress: false,
        coinbase:
          '035e100a04fbd4c65f2f706f6f6c696e2e636f6d2ffabe6d6d0451e4803ad83f4c522f35e30651d3c723b64fb0d45e5c97103b2a417deb259601000000000000003514ff11f74bf64ffccd8c6fc6d73b69119857508d00155a000000000000',
      },
    ],
    vout: [
      {
        value: '719587241',
        n: 0,
        hex: 'a914939b86fcad883b03d54a8e47a9ce9c8f0faea30087',
        addresses: ['3F9VZy8bnN7c8SyCsJVjMAdcn3stt1AaEc'],
        isAddress: true,
      },
      {
        value: '0',
        n: 1,
        hex: '6a24b9e11b6dbe3761e1928876367b50ece0e5e7de511bca3a14394fd66cf324e773b9f6e3c7',
        addresses: ['OP_RETURN b9e11b6dbe3761e1928876367b50ece0e5e7de511bca3a14394fd66cf324e773b9f6e3c7'],
        isAddress: false,
      },
      {
        value: '0',
        n: 2,
        hex: '6a24aa21a9ed12fafedab7d13a7d58e373877a99657fe70be95fdd23d18b64e4a9aec84eb4cf',
        addresses: ['OP_RETURN aa21a9ed12fafedab7d13a7d58e373877a99657fe70be95fdd23d18b64e4a9aec84eb4cf'],
        isAddress: false,
      },
      {
        value: '0',
        n: 3,
        hex: '6a2952534b424c4f434b3a846c7fc81776e0624d51470629386f1d5c9dd75714d6a0a25f813826002c6130',
        addresses: ['OP_RETURN 52534b424c4f434b3a846c7fc81776e0624d51470629386f1d5c9dd75714d6a0a25f813826002c6130'],
        isAddress: false,
      },
    ],
    blockHash: '0000000000000000000cfc71513d398fa637fc40f447b77f797fc987a2c40c73',
    blockHeight: 659550,
    confirmations: 1,
    blockTime: 1606866170,
    value: '719587241',
    valueIn: '0',
    fees: '0',
    hex: '0100000000010...',
  })
  @Example<Tx>({
    txid: '0x890482efd45fcb660b8eebe42ab4d71a24b97c46c7d9c88b1e4b3cf4bef10110',
    vin: [
      {
        n: 0,
        addresses: ['0xB3DD70991aF983Cf82d95c46C24979ee98348ffa'],
        isAddress: true,
      },
    ],
    vout: [
      {
        value: '0',
        n: 0,
        addresses: ['0xdAC17F958D2ee523a2206206994597C13D831ec7'],
        isAddress: true,
      },
    ],
    blockHash: '0xc58510150bdc388e3e3823db61f110c009b5ccd9466b58a75fe50cd053158f70',
    blockHeight: 11369941,
    confirmations: 3,
    blockTime: 1606869353,
    value: '0',
    fees: '10299250000000000',
    tokenTransfers: [
      {
        type: 'ERC20',
        from: '0xB3DD70991aF983Cf82d95c46C24979ee98348ffa',
        to: '0xa64D0b5ccFdaB0e4D8Ec7C65862Aac1c78A5666c',
        token: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        name: 'Tether USD',
        symbol: 'USDT',
        decimals: 6,
        value: '504000000',
      },
    ],
    ethereumSpecific: {
      status: 1,
      nonce: 10871,
      gasLimit: 80000,
      gasUsed: 41197,
      gasPrice: '250000000000',
      data: '0xa9059c...',
    },
  })
  @Get('tx/{txid}')
  async getTransaction(@Path() txid: string): Promise<Tx> {
    try {
      const { data } = await this.instance.get<Tx>(`api/v2/tx/${txid}`)
      return data
    } catch (err) {
      throw new ApiError(err)
    }
  }

  /**
   * Get transaction specific returns transaction data in the exact format as returned by backend, including all coin specific fields
   *
   * Examples:
   * 1. Bitcoin
   * 2. Ethereum
   *
   * @param txid transaction id
   *
   * @example txid "bc0e0f12c821c6d1d16af863b8ee8d8a09e4c023ffeeea6c5ce0c7d38c21d356"
   * @example txid "0xf5ef950d597bea8c980fe5a17faeb70ed7f5030dcf58f077baede5eb0d610cdf"
   */
  @Example<BitcoinTxSpecific>({
    txid: 'bc0e0f12c821c6d1d16af863b8ee8d8a09e4c023ffeeea6c5ce0c7d38c21d356',
    hash: '3854e427b33c17d618c020d6b320e7608a8c7e7ba8ab48f0956283b58ef85b7a',
    version: 1,
    size: 225,
    vsize: 144,
    weight: 573,
    locktime: 0,
    vin: [
      {
        txid: 'bbcb3d9ee079d7d9a5d97f928c00f9a36c14f96501c5e199aa777d57a8f96510',
        vout: 1,
        scriptSig: { asm: '', hex: '' },
        txinwitness: [
          '3044022034dd7f8071f8d5466e6921af262c9dff24f34ba970c9855fb8a908b4b855fce602203122390fada8cde3ba9edb90d542c118552f06787a93e3f8b2a9e4fc3ba3dc6401',
          '022f7b124fa7ba4c107e81f32c91e4a10abf8858a19ffe7064a7863f6647f388a8',
        ],
        sequence: 4294967295,
      },
    ],
    vout: [
      {
        value: 0.00011482,
        n: 0,
        scriptPubKey: {
          asm: 'OP_DUP OP_HASH160 35e20f27e4e25a795e2846eb4c9b3cb79d3198f2 OP_EQUALVERIFY OP_CHECKSIG',
          hex: '76a91435e20f27e4e25a795e2846eb4c9b3cb79d3198f288ac',
          reqSigs: 1,
          type: 'pubkeyhash',
          addresses: ['15uud35JNGQboswqGeGGhTttGcX413VGcw'],
        },
      },
      {
        value: 0.00530648,
        n: 1,
        scriptPubKey: {
          asm: '0 603465d067b8c65b85ace2bdff06c6a7dd0ba1b2',
          hex: '0014603465d067b8c65b85ace2bdff06c6a7dd0ba1b2',
          reqSigs: 1,
          type: 'witness_v0_keyhash',
          addresses: ['bc1qvq6xt5r8hrr9hpdvu27l7pkx5lwshgdjj3hnn3'],
        },
      },
    ],
    hex:
      '010000000001011065f9a8577d77aa99e1c50165f9146ca3f9008c927fd9a5d9d779e09e3dcbbb0100000000ffffffff02da2c0000000000001976a91435e20f27e4e25a795e2846eb4c9b3cb79d3198f288acd818080000000000160014603465d067b8c65b85ace2bdff06c6a7dd0ba1b202473044022034dd7f8071f8d5466e6921af262c9dff24f34ba970c9855fb8a908b4b855fce602203122390fada8cde3ba9edb90d542c118552f06787a93e3f8b2a9e4fc3ba3dc640121022f7b124fa7ba4c107e81f32c91e4a10abf8858a19ffe7064a7863f6647f388a800000000',
    blockhash: '000000000000000000027c5902f6f1b7d9c9bc46adc33bbe806db50a579b5d70',
    confirmations: 1184,
    time: 1632164292,
    blocktime: 1632164292,
  })
  @Example<EthereumTxSpecific>({
    tx: {
      nonce: '0x11cc',
      gasPrice: '0x826299e000',
      gas: '0x4e200',
      to: '0x6C0B51971650D28821cE30b15B02b9826a20B129',
      value: '0x0',
      input: '0xc01a8c8400000000000000000000000000000000000000000000000000000000000011e0',
      hash: '0xf5ef950d597bea8c980fe5a17faeb70ed7f5030dcf58f077baede5eb0d610cdf',
      blockNumber: '0xad9342',
      blockHash: '0xe05a93f6525aa797c3e3285c27eb34852bab8bb5a12a42b5650390ec49504160',
      from: '0x095273aDB73E55a8710E448C49eaee16fe115527',
      transactionIndex: '0x0',
    },
    receipt: {
      gasUsed: '0x1990e',
      status: '0x1',
      logs: [
        {
          address: '0x6C0B51971650D28821cE30b15B02b9826a20B129',
          topics: [
            '0x4a504a94899432a9846e1aa406dceb1bcfd538bb839071d49d1e5e23f5be30ef',
            '0x000000000000000000000000095273adb73e55a8710e448c49eaee16fe115527',
            '0x00000000000000000000000000000000000000000000000000000000000011e0',
          ],
          data: '0x',
        },
        {
          address: '0x76e95d97c10ADA1e3459a5780aDd55C225bD98CC',
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            '0x0000000000000000000000006c0b51971650d28821ce30b15b02b9826a20b129',
            '0x0000000000000000000000008c4c0a06b968586434dcde95c0f673bc956dae9b',
          ],
          data: '0x000000000000000000000000000000000000000000005295f13ebb7127c00000',
        },
        {
          address: '0x6C0B51971650D28821cE30b15B02b9826a20B129',
          topics: [
            '0x33e13ecb54c3076d8e8bb8c2881800a4d972b792045ffae98fdf46df365fed75',
            '0x00000000000000000000000000000000000000000000000000000000000011e0',
          ],
          data: '0x',
        },
      ],
    },
  })
  @Get('tx-specific/{txid}')
  async getTransactionSpecific(@Path() txid: string): Promise<TxSpecific> {
    try {
      const { data } = await this.instance.get<TxSpecific>(`api/v2/tx-specific/${txid}`)
      return data
    } catch (err) {
      throw new ApiError(err)
    }
  }

  /**
   * Get address returns balances and transactions of an address. The returned transactions are sorted by block height, newest blocks first.
   *
   * Examples:
   * 1. Ethereum (basic)
   * 2. Ethereum (tokens)
   * 3. Ethereum (tokenBalances)
   * 4. Ethereum (txids)
   *
   * @param address account address
   * @param page specifies page of returned transactions, starting from 1. If out of range, Blockbook returns the closest possible page.
   * @param pageSize number of transactions returned by call (default and maximum 1000)
   * @param from filter of the returned transactions starting at from block
   * @param to filter of the returned transactions up until to block
   * @param details
   *    * **basic**: return only address balances, without any transactions
   *    * **tokens**: basic + tokens belonging to the address (applicable only to some coins)
   *    * **tokenBalances**: basic + tokens with balances + belonging to the address (applicable only to some coins)
   *    * **txids**: tokenBalances + list of txids, subject to from, to filter and paging
   *    * **txslight**: tokenBalances + list of transaction with limited details (only data from index), subject to from, to filter and paging
   *    * **txs (default)**: tokenBalances + list of transaction with details, subject to from, to filter and paging
   * @param contract return only transactions which affect specified contract (applicable only to coins which support contracts)
   *
   * @example address "0x37863DF4712e4494dFfc4854862259399354b2BB"
   * @example address "0x37863DF4712e4494dFfc4854862259399354b2BB"
   * @example address "0x37863DF4712e4494dFfc4854862259399354b2BB"
   * @example address "0x37863DF4712e4494dFfc4854862259399354b2BB"
   */
  @Example<Address>({
    address: '0x37863DF4712e4494dFfc4854862259399354b2BB',
    balance: '155365245155486598',
    unconfirmedBalance: '0',
    unconfirmedTxs: 0,
    txs: 12,
    nonTokenTxs: 12,
    nonce: '10',
  })
  @Example<Address>({
    address: '0x37863DF4712e4494dFfc4854862259399354b2BB',
    balance: '155365245155486598',
    unconfirmedBalance: '0',
    unconfirmedTxs: 0,
    txs: 12,
    nonTokenTxs: 12,
    nonce: '10',
    tokens: [
      {
        type: 'ERC20',
        name: 'NuCypher',
        contract: '0x4fE83213D56308330EC302a8BD641f1d0113A4Cc',
        transfers: 2,
        symbol: 'NU',
        decimals: 18,
      },
      {
        type: 'ERC20',
        name: 'VectorspaceAI',
        contract: '0x7D29A64504629172a429e64183D6673b9dAcbFCe',
        transfers: 3,
        symbol: 'VXV',
        decimals: 18,
      },
      {
        type: 'ERC20',
        name: 'DefiDollar DAO',
        contract: '0x20c36f062a31865bED8a5B1e512D9a1A20AA333A',
        transfers: 1,
        symbol: 'DFD',
        decimals: 18,
      },
    ],
  })
  @Example<Address>({
    address: '0x37863DF4712e4494dFfc4854862259399354b2BB',
    balance: '155365245155486598',
    unconfirmedBalance: '0',
    unconfirmedTxs: 0,
    txs: 12,
    nonTokenTxs: 12,
    nonce: '10',
    tokens: [
      {
        type: 'ERC20',
        name: 'NuCypher',
        contract: '0x4fE83213D56308330EC302a8BD641f1d0113A4Cc',
        transfers: 2,
        symbol: 'NU',
        decimals: 18,
        balance: '0',
      },
      {
        type: 'ERC20',
        name: 'VectorspaceAI',
        contract: '0x7D29A64504629172a429e64183D6673b9dAcbFCe',
        transfers: 3,
        symbol: 'VXV',
        decimals: 18,
        balance: '0',
      },
      {
        type: 'ERC20',
        name: 'DefiDollar DAO',
        contract: '0x20c36f062a31865bED8a5B1e512D9a1A20AA333A',
        transfers: 1,
        symbol: 'DFD',
        decimals: 18,
        balance: '1000000000000000000000',
      },
    ],
  })
  @Example<Address>({
    page: 1,
    totalPages: 1,
    itemsOnPage: 1000,
    address: '0x37863DF4712e4494dFfc4854862259399354b2BB',
    balance: '155365245155486598',
    unconfirmedBalance: '0',
    unconfirmedTxs: 0,
    txs: 12,
    nonTokenTxs: 12,
    txids: [
      '0x69bc89feb7a6d79fe1a1cb578d1f06bd2d4dbd334895dcba4a356d3f98d7518e',
      '0x3e9384cd55dc5427c7c4e0cce93351b78b0c01f9253ae2808b05779aa67f5b77',
      '0x822ae073bb27eea492b3218f09d4a26cab80e5d837b2c861133c69e4663f9fb4',
      '0x60ceb102ef0c95c17acdf4930cc8552d39af6d0c86d2f90fe0c04f3cbb34de82',
      '0xc17a278a1501d7b27e69a4aa4197f1894c11aac29e63c6829bfb4c7a3934d6e8',
      '0x439b205c5a3e4eebc016717d5745aa71e3138a30e5dda018f350a32e0a39c678',
      '0xc6639a905e1f6af1c6f3c40ac0e2b2eefb5a7f40567acf1bc729768225dd0101',
      '0x83506c53c5ebb53e85b1f50084e008f932b7f52642158b04b19f5728ac864bf3',
      '0x86ef391fcf54c5f1784a9355d952c7e8e784bdbff8b906ffcda798f2544b318c',
      '0xa2124bd526af587859c2ae14ddd97ed4fc4e7dd49c801061547026d29165c73a',
      '0x1a8180afc12a9cb60adca895936f92955e2a04eb0e53a6be72d70617149aeadc',
      '0x0795093293dd34fdef55b909c18cd15755e3a0d1668f850dc484f09ec68b5258',
    ],
    nonce: '10',
    tokens: [
      {
        type: 'ERC20',
        name: 'NuCypher',
        contract: '0x4fE83213D56308330EC302a8BD641f1d0113A4Cc',
        transfers: 2,
        symbol: 'NU',
        decimals: 18,
        balance: '0',
      },
      {
        type: 'ERC20',
        name: 'VectorspaceAI',
        contract: '0x7D29A64504629172a429e64183D6673b9dAcbFCe',
        transfers: 3,
        symbol: 'VXV',
        decimals: 18,
        balance: '0',
      },
      {
        type: 'ERC20',
        name: 'DefiDollar DAO',
        contract: '0x20c36f062a31865bED8a5B1e512D9a1A20AA333A',
        transfers: 1,
        symbol: 'DFD',
        decimals: 18,
        balance: '1000000000000000000000',
      },
    ],
  })
  @Get('address/{address}')
  async getAddress(
    @Path() address: string,
    @Query() page?: number,
    @Query() pageSize?: number,
    @Query() from?: number,
    @Query() to?: number,
    @Query() details?: 'basic' | 'tokens' | 'tokenBalances' | 'txids' | 'txslight' | 'txs',
    @Query() contract?: string
  ): Promise<Address> {
    try {
      const { data } = await this.instance.get<Address>(`api/v2/address/${address}`, {
        params: {
          page,
          pageSize,
          from,
          to,
          details,
          contract,
        },
      })
      return data
    } catch (err) {
      throw new ApiError(err)
    }
  }

  /**
   * Returns balances and transactions of an xpub, applicable only for Bitcoin-type coins.
   *
   * Blockbook supports BIP44, BIP49 and BIP84 derivation schemes. It expects xpub at level 3 derivation path, i.e. m/purpose'/coin_type'/account'/. Blockbook completes the change/address_index part of the path when deriving addresses.
   *
   * The BIP version is determined by the prefix of the xpub. The prefixes for each coin are defined by fields xpub_magic, xpub_magic_segwit_p2sh, xpub_magic_segwit_native in the trezor-common library. If the prefix is not recognized, Blockbook defaults to BIP44 derivation scheme.
   *
   * The returned transactions are sorted by block height, newest blocks first.
   *
   * Examples:
   * 1. Bitcoin (basic)
   * 2. Bitcoin (tokens)
   * 3. Bitcoin (tokenBalances)
   * 4. Bitcoin (txids)
   *
   * @param xpub extended public key
   * @param page specifies page of returned transactions, starting from 1. If out of range, Blockbook returns the closest possible page.
   * @param pageSize number of transactions returned by call (default and maximum 1000)
   * @param from filter of the returned transactions starting at from block
   * @param to filter of the returned transactions up until to block
   * @param details
   *    * **basic**: return only xpub balances, without any derived addresses and transactions
   *    * **tokens**: basic + tokens (addresses) derived from the xpub, subject to tokens parameter
   *    * **tokenBalances**: basic + tokens (addresses) derived from the xpub with balances, subject to tokens parameter
   *    * **txids**: tokenBalances + list of txids, subject to from, to filter and paging
   *    * **txs (default)**: tokenBalances + list of transaction with details, subject to from, to filter and paging
   * @param tokens specifies what tokens (xpub addresses) are returned by the request
   *    * **nonzero (default)**: return only addresses with nonzero balance
   *    * **used**: return addresses with at least one transaction
   *    * **derived**: return all derived addresses
   *
   * @example xpub "xpub6DQYbVJSVvJPzpYenir7zVSf2WPZRu69LxZuMezzAKuT6biPcug6Vw1zMk4knPBeNKvioutc4EGpPQ8cZiWtjcXYvJ6wPiwcGmCkihA9Jy3"
   * @example xpub "xpub6DQYbVJSVvJPzpYenir7zVSf2WPZRu69LxZuMezzAKuT6biPcug6Vw1zMk4knPBeNKvioutc4EGpPQ8cZiWtjcXYvJ6wPiwcGmCkihA9Jy3"
   * @example xpub "xpub6DQYbVJSVvJPzpYenir7zVSf2WPZRu69LxZuMezzAKuT6biPcug6Vw1zMk4knPBeNKvioutc4EGpPQ8cZiWtjcXYvJ6wPiwcGmCkihA9Jy3"
   * @example xpub "xpub6DQYbVJSVvJPzpYenir7zVSf2WPZRu69LxZuMezzAKuT6biPcug6Vw1zMk4knPBeNKvioutc4EGpPQ8cZiWtjcXYvJ6wPiwcGmCkihA9Jy3"
   */
  @Example<Xpub>({
    address:
      'xpub6DQYbVJSVvJPzpYenir7zVSf2WPZRu69LxZuMezzAKuT6biPcug6Vw1zMk4knPBeNKvioutc4EGpPQ8cZiWtjcXYvJ6wPiwcGmCkihA9Jy3',
    balance: '729',
    totalReceived: '10407',
    totalSent: '9678',
    unconfirmedBalance: '0',
    unconfirmedTxs: 0,
    txs: 3,
    usedTokens: 2,
  })
  @Example<Xpub>({
    address:
      'xpub6DQYbVJSVvJPzpYenir7zVSf2WPZRu69LxZuMezzAKuT6biPcug6Vw1zMk4knPBeNKvioutc4EGpPQ8cZiWtjcXYvJ6wPiwcGmCkihA9Jy3',
    balance: '729',
    totalReceived: '10407',
    totalSent: '9678',
    unconfirmedBalance: '0',
    unconfirmedTxs: 0,
    txs: 3,
    usedTokens: 2,
    tokens: [
      {
        type: 'XPUBAddress',
        name: '14mMwtZCGiAtyr8KnnAZYyHmZ9Zvj71h4t',
        path: "m/44'/0'/0'/1/0",
        transfers: 1,
        decimals: 8,
      },
    ],
  })
  @Example<Xpub>({
    address:
      'xpub6DQYbVJSVvJPzpYenir7zVSf2WPZRu69LxZuMezzAKuT6biPcug6Vw1zMk4knPBeNKvioutc4EGpPQ8cZiWtjcXYvJ6wPiwcGmCkihA9Jy3',
    balance: '729',
    totalReceived: '10407',
    totalSent: '9678',
    unconfirmedBalance: '0',
    unconfirmedTxs: 0,
    txs: 3,
    usedTokens: 2,
    tokens: [
      {
        type: 'XPUBAddress',
        name: '14mMwtZCGiAtyr8KnnAZYyHmZ9Zvj71h4t',
        path: "m/44'/0'/0'/1/0",
        transfers: 1,
        decimals: 8,
        balance: '729',
        totalReceived: '729',
        totalSent: '0',
      },
    ],
  })
  @Example<Xpub>({
    page: 1,
    totalPages: 1,
    itemsOnPage: 1000,
    address:
      'xpub6DQYbVJSVvJPzpYenir7zVSf2WPZRu69LxZuMezzAKuT6biPcug6Vw1zMk4knPBeNKvioutc4EGpPQ8cZiWtjcXYvJ6wPiwcGmCkihA9Jy3',
    balance: '729',
    totalReceived: '10407',
    totalSent: '9678',
    unconfirmedBalance: '0',
    unconfirmedTxs: 0,
    txs: 2,
    txids: [
      '02cdb69a97d1b8585797ac31a1954804b40a71c380a3ede0793f21a2cdfd300a',
      'de5105b810d8482325d119b8e40c0cfeed43cfd273b02fb29d26a699d6b769d4',
    ],
    usedTokens: 2,
    tokens: [
      {
        type: 'XPUBAddress',
        name: '14mMwtZCGiAtyr8KnnAZYyHmZ9Zvj71h4t',
        path: "m/44'/0'/0'/1/0",
        transfers: 1,
        decimals: 8,
        balance: '729',
        totalReceived: '729',
        totalSent: '0',
      },
    ],
  })
  @Get('xpub/{xpub}')
  async getXpub(
    @Path() xpub: string,
    @Query() page?: number,
    @Query() pageSize?: number,
    @Query() from?: number,
    @Query() to?: number,
    @Query() details?: 'basic' | 'tokens' | 'tokenBalances' | 'txids' | 'txs',
    @Query() tokens?: 'nonzero' | 'used' | 'derived'
  ): Promise<Xpub> {
    try {
      const { data } = await this.instance.get<Xpub>(`api/v2/xpub/${xpub}`, {
        params: {
          page,
          pageSize,
          from,
          to,
          details,
          tokens,
        },
      })
      return data
    } catch (err) {
      throw new ApiError(err)
    }
  }

  /**
   * Returns array of unspent transaction outputs of address or xpub, applicable only for Bitcoin-type coins. By default, the list contains both confirmed and unconfirmed transactions. The query parameter confirmed=true disables return of unconfirmed transactions. The returned utxos are sorted by block height, newest blocks first. For xpubs the response also contains address and derivation path of the utxo.
   * Unconfirmed utxos do not have field height, the field confirmations has value 0 and may contain field lockTime, if not zero.
   * Coinbase utxos do have field coinbase set to true, however due to performance reasons only up to minimum coinbase confirmations limit (100). After this limit, utxos are not detected as coinbase.
   *
   * Examples
   * 1. Bitcoin (address)
   * 2. Bitcoin (xpub)
   *
   * @param account address or xpub
   * @param confirmed
   *    * **false (default)**: returns both confirmed and unconfirmed transactions
   *    * **true**: returns only confirmed transactions
   *
   * @example account "14mMwtZCGiAtyr8KnnAZYyHmZ9Zvj71h4t"
   * @example account "xpub6DQYbVJSVvJPzpYenir7zVSf2WPZRu69LxZuMezzAKuT6biPcug6Vw1zMk4knPBeNKvioutc4EGpPQ8cZiWtjcXYvJ6wPiwcGmCkihA9Jy3"
   */
  @Example<Array<Utxo>>([
    {
      txid: '02cdb69a97d1b8585797ac31a1954804b40a71c380a3ede0793f21a2cdfd300a',
      vout: 1,
      value: '729',
      height: 601428,
      confirmations: 58362,
      address: '14mMwtZCGiAtyr8KnnAZYyHmZ9Zvj71h4t',
      path: "m/44'/0'/0'/1/0",
    },
  ])
  @Get('utxo/{account}')
  async getUtxo(@Path() account: string, @Query() confirmed?: boolean): Promise<Array<Utxo>> {
    try {
      const { data } = await this.instance.get<Array<Utxo>>(`api/v2/utxo/${account}`, {
        params: {
          confirmed,
        },
      })
      return data
    } catch (err) {
      throw new ApiError(err)
    }
  }

  /**
   * Returns information about block with transactions, subject to paging.
   *
   * Examples
   * 1. Ethereum (block height)
   * 2. Ethereum (block hash)
   *
   * @param block block height or block hash
   * @param page specifies page of returned transactions, starting from 1. If out of range, Blockbook returns the closest possible page.
   *
   * @example block 500000
   * @example block "0x068c1569e89ffb3d496641617e41404c7d47c3a0ccab55e6ae0b045ff189b389"
   */
  @Example<Block>({
    page: 1,
    totalPages: 1,
    itemsOnPage: 1000,
    hash: '0xac8e95f7483f7131261bcc0a70873f8236c27444c940defc677f74f281220193',
    previousBlockHash: '0x794a1bef434928ce3aadd2f5eced2bf72ac714a30e9e4ab5965d7d9760300d84',
    nextBlockHash: '0xf645c2ab37dd99619cd2183b6c314b9495afa157632d7ecb648ccc98cd3e82c3',
    height: 500000,
    confirmations: 10880882,
    size: 541,
    time: 1446832865,
    version: 0,
    merkleRoot: '',
    nonce: '0x8901a71893cb3488',
    bits: '',
    difficulty: '0x6dcc051573d',
    txCount: 0,
  })
  @Example<Block>({
    page: 1,
    totalPages: 1,
    itemsOnPage: 1000,
    hash: '0x068c1569e89ffb3d496641617e41404c7d47c3a0ccab55e6ae0b045ff189b389',
    previousBlockHash: '0x5783e02a998984893a4e44139c4cd452c32d5a1f30405cca196812e787859fb9',
    nextBlockHash: '0x94d0de3e476c999d622531a82c33c3ea0464a9dabe6063d5e4efafdaaf0040dd',
    height: 600000,
    confirmations: 10780895,
    size: 656,
    time: 1448548070,
    version: 0,
    merkleRoot: '',
    nonce: '0x4d2dd664365d838b',
    bits: '',
    difficulty: '0x6dfd480d3ef',
    txCount: 1,
    txs: [
      {
        txid: '0x97d99bc7729211111a21b12c933c949d4f31684f1d6954ff477d0477538ff017',
        vin: [
          {
            n: 0,
            addresses: ['0x4Bb96091Ee9D802ED039C4D1a5f6216F90f81B01'],
            isAddress: true,
          },
        ],
        vout: [
          {
            value: '4950000000000000000',
            n: 0,
            addresses: ['0x45060b5ceE190661fa27D1e189f431f7b2b52275'],
            isAddress: true,
          },
        ],
        blockHash: '0x068c1569e89ffb3d496641617e41404c7d47c3a0ccab55e6ae0b045ff189b389',
        blockHeight: 600000,
        confirmations: 10780895,
        blockTime: 1448548070,
        value: '4950000000000000000',
        fees: '1050000000000000',
        ethereumSpecific: {
          status: -2,
          nonce: 16522,
          gasLimit: 41000,
          gasUsed: 21000,
          gasPrice: '50000000000',
          data: '0x',
        },
      },
    ],
  })
  @Get('block/{block}')
  async getBlock(@Path() block: string, @Query() page?: number): Promise<Block> {
    try {
      const { data } = await this.instance.get<Block>(`api/v2/block/${block}`, {
        params: {
          page,
        },
      })
      return data
    } catch (err) {
      throw new ApiError(err)
    }
  }

  /**
   * Sends new transaction to backend.
   *
   * Examples
   * 1. Ethereum
   *
   * @param hex serialized transaction data
   */
  @Example<SendTx>({
    result: '0x97d99bc7729211111a21b12c933c949d4f31684f1d6954ff477d0477538ff017',
  })
  @Get('sendtx/{hex}')
  async sendTransaction(@Path() hex: string): Promise<SendTx> {
    try {
      const { data } = await this.instance.get<SendTx>(`api/v2/sendtx/${hex}`)
      return data
    } catch (err) {
      throw new ApiError(err)
    }
  }

  /**
   * Returns a balance history for the specified XPUB or address.
   *
   * Examples
   * 1. Ethereum
   *
   * @param account xpub or address
   * @param from specifies a start date as a Unix timestamp
   * @param to specifies an end data as a Unix timestamp
   * @param fiatcurrency if specified, the response will contain fiat rate at the time of transaction. If not, all available currencies will be returned.
   * @param groupBy an interval in seconds, to group results by. Default is 3600 seconds.
   *
   * @example account "0x37863DF4712e4494dFfc4854862259399354b2BB"
   * @example fiatcurrency "usd"
   */
  @Example<Array<BalanceHistory>>([
    {
      time: 1602806400,
      txs: 4,
      received: '4990000000000000000',
      sent: '4984861615113576402',
      sentToSelf: '0',
      rates: {
        usd: 377.15868107868175,
      },
    },
    {
      time: 1606496400,
      txs: 1,
      received: '2000000000000000000',
      sent: '0',
      sentToSelf: '0',
      rates: {
        usd: 506.28,
      },
    },
  ])
  @Get('balancehistory/{account}')
  async balanceHistory(
    @Path() account: string,
    @Query() from?: number,
    @Query() to?: number,
    @Query() fiatcurrency?: string,
    @Query() groupBy?: number
  ): Promise<Array<BalanceHistory>> {
    try {
      const { data } = await this.instance.get<Array<BalanceHistory>>(`api/v2/balancehistory/${account}`, {
        params: {
          from,
          to,
          fiatcurrency,
          groupBy,
        },
      })
      return data
    } catch (err) {
      throw new ApiError(err)
    }
  }
}
