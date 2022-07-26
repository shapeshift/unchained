import axios from 'axios'
import axiosRetry from 'axios-retry'
import { ApiError as BlockbookApiError, Blockbook, Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import { ApiError, BadRequestError, BaseAPI, Cursor, RPCRequest, RPCResponse, SendTxBody } from '../'
import { Account, Address, API, NetworkFee, NetworkFees, RawTx, Tx, TxHistory, Utxo } from './models'
import { NodeBlock } from './types'

axiosRetry(axios, { retries: 5, retryDelay: axiosRetry.exponentialDelay })

const handleError = (err: unknown): ApiError => {
  if (err instanceof BlockbookApiError) {
    return new ApiError(err.response?.statusText ?? 'Internal Server Error', err.response?.status ?? 500, err.message)
  }

  if (err instanceof Error) {
    return new ApiError('Internal Server Error', 500, err.message)
  }

  return new ApiError('Internal Server Error', 500, 'unknown error')
}

export interface ServiceArgs {
  blockbook: Blockbook
  rpcUrl: string
  isXpub: (pubkey: string) => boolean
}

export class Service implements Omit<BaseAPI, 'getInfo'>, API {
  readonly isXpub: (pubkey: string) => boolean

  private readonly blockbook: Blockbook
  private readonly rpcUrl: string

  constructor(args: ServiceArgs) {
    this.blockbook = args.blockbook
    this.rpcUrl = args.rpcUrl
    this.isXpub = args.isXpub
  }

  async getAccount(pubkey: string): Promise<Account> {
    try {
      const data = await (() => {
        if (this.isXpub(pubkey)) {
          return this.blockbook.getXpub(pubkey, undefined, undefined, undefined, undefined, 'tokenBalances', 'derived')
        }

        return this.blockbook.getAddress(pubkey, undefined, undefined, undefined, undefined, 'basic')
      })()

      // list of all used addresses with additional derived addresses up to gap limit of 20, including any detected balances
      const addresses = data.tokens?.map<Address>((token) => ({
        balance: token.balance ?? '0',
        pubkey: token.name,
      }))

      // For any change indexes detected by blockbook, we want to find the next unused address.
      // To do this we will add 1 to any address indexes found and keep track of the highest index.
      const nextAddressIndexes = (data.tokens ?? []).reduce<Array<number>>((prev, token) => {
        if (!token.path || token.transfers === 0) return prev

        const [, , , , change, addressIndex] = token.path.split('/')
        const changeIndex = Number(change)
        const nextAddressIndex = Number(addressIndex) + 1

        if (!prev[changeIndex] || nextAddressIndex > prev[changeIndex]) {
          prev[changeIndex] = nextAddressIndex
        }

        return prev
      }, [])

      return {
        pubkey: data.address,
        balance: data.balance,
        unconfirmedBalance: data.unconfirmedBalance,
        addresses,
        nextReceiveAddressIndex: nextAddressIndexes[0] ?? 0,
        nextChangeAddressIndex: nextAddressIndexes[1] ?? 0,
      }
    } catch (err) {
      throw handleError(err)
    }
  }

  async getTxHistory(pubkey: string, cursor?: string, pageSize = 10): Promise<TxHistory> {
    if (pageSize <= 0) throw new ApiError('Bad Request', 422, 'page size must be greater than 0')

    try {
      const curCursor = ((): Cursor => {
        try {
          if (!cursor) return { page: 1 }

          return JSON.parse(Buffer.from(cursor, 'base64').toString('binary'))
        } catch (err) {
          const e: BadRequestError = { error: `invalid base64 cursor: ${cursor}` }
          throw new ApiError('Bad Request', 422, JSON.stringify(e))
        }
      })()

      const data = await (() => {
        if (this.isXpub(pubkey)) {
          return this.blockbook.getXpub(pubkey, curCursor.page, pageSize, undefined, undefined, 'txs')
        }

        return this.blockbook.getAddress(pubkey, curCursor.page, pageSize, undefined, undefined, 'txs')
      })()

      curCursor.page++

      let nextCursor: string | undefined
      if (curCursor.page <= (data.totalPages ?? 0)) {
        nextCursor = Buffer.from(JSON.stringify(curCursor), 'binary').toString('base64')
      }

      return {
        pubkey: pubkey,
        cursor: nextCursor,
        txs: data.transactions?.map(this.handleTransaction) ?? [],
      }
    } catch (err) {
      throw handleError(err)
    }
  }

  async getTransaction(txid: string): Promise<Tx> {
    try {
      const data = await this.blockbook.getTransaction(txid)
      return this.handleTransaction(data)
    } catch (err) {
      throw handleError(err)
    }
  }

  async getRawTransaction(txid: string): Promise<RawTx> {
    try {
      const data = await this.blockbook.getTransactionSpecific(txid)
      return data as RawTx
    } catch (err) {
      throw handleError(err)
    }
  }

  async getUtxos(pubkey: string): Promise<Array<Utxo>> {
    try {
      const data = await this.blockbook.getUtxo(pubkey)
      return data
    } catch (err) {
      throw handleError(err)
    }
  }

  async sendTx(body: SendTxBody): Promise<string> {
    try {
      const { result } = await this.blockbook.sendTransaction(body.hex)
      return result
    } catch (err) {
      throw handleError(err)
    }
  }

  async getNetworkFees(): Promise<NetworkFees> {
    try {
      const blockTimes = { fast: 2, average: 5, slow: 10 }
      const result = await this.blockbook.estimateFees(Object.values(blockTimes))
      return Object.entries(blockTimes).reduce<NetworkFees>((prev, [key, val], index) => {
        const networkFee: NetworkFee = {
          blocksUntilConfirmation: val,
          satsPerKiloByte: Number(result[index].feePerUnit),
        }
        return { ...prev, [key]: networkFee }
      }, {})
    } catch (err) {
      throw handleError(err)
    }
  }

  async handleBlock(hash: string): Promise<Array<BlockbookTx>> {
    const request: RPCRequest = {
      jsonrpc: '2.0',
      id: `getblock-${hash}`,
      method: 'getblock',
      params: [hash],
    }

    const { data } = await axios.post<RPCResponse>(this.rpcUrl, request)

    if (data.error) throw new Error(`failed to get block: ${hash}: ${data.error.message}`)
    if (!data.result) throw new Error(`failed to get block: ${hash}: ${JSON.stringify(data)}`)

    const block = data.result as NodeBlock

    // make best effort to fetch all transactions, but don't fail handling block if a single transaction fails
    const txs = await Promise.allSettled(block.tx.map((hash) => this.blockbook.getTransaction(hash)))

    return (txs.filter((tx) => tx.status === 'fulfilled') as Array<PromiseFulfilledResult<BlockbookTx>>).map(
      (tx) => tx.value
    )
  }

  handleTransaction(tx: BlockbookTx): Tx {
    return {
      txid: tx.txid,
      blockHash: tx.blockHash,
      blockHeight: tx.blockHeight,
      timestamp: tx.blockTime,
      confirmations: tx.confirmations,
      value: tx.value,
      fee: tx.fees ?? '0',
      hex: tx.hex ?? '',
      vin: tx.vin.map((vin) => ({
        txid: vin.txid,
        vout: vin.vout?.toString(),
        sequence: vin.sequence,
        coinbase: vin.coinbase,
        ...(vin.hex && {
          scriptSig: {
            hex: vin.hex,
          },
        }),
        addresses: vin.addresses,
        value: vin.value,
      })),
      vout: tx.vout.map((vout) => ({
        value: vout.value ?? '0',
        n: vout.n,
        ...(!vout.isAddress &&
          vout.addresses?.length &&
          vout.addresses[0]?.includes('OP_RETURN') && {
            opReturn: vout.addresses[0],
          }),
        scriptPubKey: {
          hex: vout.hex,
        },
        ...(vout.isAddress && {
          addresses: vout.addresses ?? undefined,
        }),
      })),
    }
  }
}
