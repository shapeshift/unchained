import { Body, Controller, Example, Get, Path, Post, Query, Response, Route, Tags } from 'tsoa'
import {
  BadRequestError,
  BaseAPI,
  BaseInfo,
  InternalServerError,
  RPCRequest,
  RPCResponse,
  SendTxBody,
  ValidationError,
} from '../'
import { API, Account, Tx, TxHistory, TokenMetadata, TokenType } from './models'
import { Service } from './service'

const NETWORK = process.env.NETWORK

if (!NETWORK) throw new Error('NETWORK env var not set')

@Route('api/v1')
@Tags('v1')
export class EVM extends Controller implements BaseAPI, Omit<API, 'getGasFees' | 'estimateGas'> {
  static service: Service

  /**
   * Get information about the running coinstack
   *
   * @returns {Promise<BaseInfo>} coinstack info
   */
  @Example<BaseInfo>({
    network: 'mainnet',
  })
  @Get('info/')
  async getInfo(): Promise<BaseInfo> {
    return {
      network: NETWORK as string,
    }
  }

  /**
   * Get account details by address
   *
   * @param {string} pubkey account address
   *
   * @returns {Promise<Account>} account details
   */
  @Example<Account>({
    balance: '284809805024198107',
    unconfirmedBalance: '0',
    nonce: 1,
    pubkey: '0xB3DD70991aF983Cf82d95c46C24979ee98348ffa',
    tokens: [
      {
        balance: '1337',
        contract: '0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d',
        decimals: 18,
        name: 'FOX',
        symbol: 'FOX',
        type: 'ERC20',
      },
    ],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}')
  async getAccount(@Path() pubkey: string): Promise<Account> {
    return EVM.service.getAccount(pubkey)
  }

  /**
   * Get transaction history by address
   *
   * @param {string} pubkey account address
   * @param {string} [cursor] the cursor returned in previous query (base64 encoded json object with a 'page' property)
   * @param {number} [pageSize] page size (10 by default)
   * @param {number} [from] from block number (0 by default)
   * @param {number} [to] to block number (pending by default)
   *
   * @returns {Promise<TxHistory>} transaction history
   */
  @Example<TxHistory>({
    pubkey: '0xB3DD70991aF983Cf82d95c46C24979ee98348ffa',
    cursor:
      'eyJibG9ja2Jvb2tQYWdlIjoxLCJldGhlcnNjYW5QYWdlIjoxLCJibG9ja2Jvb2tUeGlkIjoiMHhhZWU0MzJmODUzZmRjMTNhZDlmZjZjYWJlMmEzOTQwM2Q4N2RkZWUxODQyNDk2ODE4ZmNkODg3NDdmNjU2NmY5IiwiYmxvY2tIZWlnaHQiOjEzODUwMjEzfQ==',
    txs: [
      {
        txid: '0x8e3528c933483770a3c8377c2ee7e34f846908653168188fd0d90a20b295d002',
        blockHash: '0x94228c1b7052720846e2d7b9f36de30acf45d9a06ec483bd4433c5c38c8673a8',
        blockHeight: 12267105,
        timestamp: 1618788849,
        status: 1,
        from: '0xB3DD70991aF983Cf82d95c46C24979ee98348ffa',
        to: '0x642F4Bda144C63f6DC47EE0fDfbac0a193e2eDb7',
        confirmations: 2088440,
        value: '737092621690531649',
        fee: '3180000000009000',
        gasLimit: '21000',
        gasUsed: '21000',
        gasPrice: '151428571429',
        inputData: '0x',
      },
    ],
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('account/{pubkey}/txs')
  async getTxHistory(
    @Path() pubkey: string,
    @Query() cursor?: string,
    @Query() pageSize = 10,
    @Query() from?: number,
    @Query() to?: number
  ): Promise<TxHistory> {
    return EVM.service.getTxHistory(pubkey, cursor, pageSize, from, to)
  }

  /**
   * Get transaction details
   *
   * @param {string} txid transaction hash
   *
   * @returns {Promise<Tx>} transaction payload
   */
  @Example<Tx>({
    txid: '0x8825fe8d60e1aa8d990f150bffe1196adcab36d0c4e98bac76c691719103b79d',
    blockHash: '0x122f1e1b594b797d96c1777ce9cdb68ddb69d262ac7f2ddc345909aba4ebabd7',
    blockHeight: 14813163,
    timestamp: 1653078780,
    status: 1,
    from: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8',
    to: '0x275C7d416c1DBfafa53A861EEc6F0AD6138ca4dD',
    confirmations: 21,
    value: '49396718157429775',
    fee: '603633477678000',
    gasLimit: '250000',
    gasUsed: '21000',
    gasPrice: '28744451318',
    inputData: '0x',
  })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('tx/{txid}')
  async getTransaction(@Path() txid: string): Promise<Tx> {
    return EVM.service.getTransaction(txid)
  }

  /**
   * Sends raw transaction to be broadcast to the node.
   *
   * @param {SendTxBody} body serialized raw transaction hex
   *
   * @returns {Promise<string>} transaction id
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Post('send/')
  async sendTx(@Body() body: SendTxBody): Promise<string> {
    return EVM.service.sendTx(body)
  }

  /**
   * Makes a jsonrpc request to the node.
   *
   * @param {RPCRequest | Array<RPCRequest>} body jsonrpc request or batch requests
   *
   * @returns {Promise<RPCResponse | Array<RPCResponse>>} jsonrpc response or batch responses
   *
   * @example body {
   *    "jsonrpc": "2.0",
   *    "id": "test",
   *    "method": "eth_blockNumber",
   *    "params": []
   * }
   */
  @Example<RPCResponse>({
    jsonrpc: '2.0',
    id: 'test',
    result: '0x1a4',
  })
  @Post('jsonrpc/')
  async doRpcRequest(@Body() body: RPCRequest | Array<RPCRequest>): Promise<RPCResponse | Array<RPCResponse>> {
    return EVM.service.doRpcRequest(body)
  }

  /**
   * Get token metadata
   *
   * @param {string} contract contract address
   * @param {string} id token identifier
   * @param {TokenType} type token type (erc721 or erc1155)
   *
   * @returns {Promise<TokenMetadata>} token metadata
   */
  @Example<TokenMetadata>({
    name: 'Foxy',
    description: 'FOXatars are a cyber-fox NFT project created by ShapeShift and Mercle',
    media: {
      url: 'https://storage.mercle.xyz/ipfs/bafybeifihbavnaqwmisq72nwqpmxy3qkfqxj5nvjg7wimluhisp7wkzcru',
      type: 'image',
    },
  })
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/metadata/token')
  async getTokenMetadata(
    @Query() contract: string,
    @Query() id: string,
    @Query() type: TokenType
  ): Promise<TokenMetadata> {
    return EVM.service.getTokenMetadata(contract, id, type)
  }
}
