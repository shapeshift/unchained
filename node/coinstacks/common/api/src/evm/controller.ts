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
import { BlockbookService } from './blockbookService'
import { MoralisService } from './moralisService'

const NETWORK = process.env.NETWORK

if (!NETWORK) throw new Error('NETWORK env var not set')

@Route('api/v1')
@Tags('v1')
export class EVM extends Controller implements BaseAPI, Omit<API, 'getGasFees' | 'estimateGas'> {
  static service: BlockbookService | MoralisService

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
    balance: '0',
    unconfirmedBalance: '0',
    nonce: 0,
    pubkey: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
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
    pubkey: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
    txs: [
      {
        txid: '0x6850c6f3af68eb60a211af8f07f5b305375d0c94786b79a48371f5143953cb26',
        blockHash: '0x969bda3f454330557492deacffb0ee8a7fd1d094cf884926d24c71ad11ed13bb',
        blockHeight: 15624164,
        timestamp: 1664275343,
        status: 1,
        from: '0xc730B028dA66EBB14f20e67c68DD809FBC49890D',
        to: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
        confirmations: 3911254,
        value: '5384660932716527',
        fee: '278408778879000',
        gasLimit: '21000',
        gasUsed: '21000',
        gasPrice: '13257560899',
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
    txid: '0x6850c6f3af68eb60a211af8f07f5b305375d0c94786b79a48371f5143953cb26',
    blockHash: '0x969bda3f454330557492deacffb0ee8a7fd1d094cf884926d24c71ad11ed13bb',
    blockHeight: 15624164,
    timestamp: 1664275343,
    status: 1,
    from: '0xc730B028dA66EBB14f20e67c68DD809FBC49890D',
    to: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
    confirmations: 3911254,
    value: '5384660932716527',
    fee: '278408778879000',
    gasLimit: '21000',
    gasUsed: '21000',
    gasPrice: '13257560899',
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
    address: '0x0000000000000000000000000000000000000000',
    id: '123456789',
    type: 'ERC721',
    name: 'FoxyFox',
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
