import axios from 'axios'
import BN from 'bignumber.js'
import type { Blockbook, Tx as BlockbookTx } from '@shapeshiftoss/blockbook'
import type { AddressFormatter, BadRequestError, BaseAPI, RPCRequest, RPCResponse, SendTxBody } from '../'
import { ApiError } from '../'
import type { Account, Address, API, NetworkFee, NetworkFees, RawTx, Tx, TxHistory, Utxo } from './models'
import { handleError, validatePageSize } from '../utils'
import type { Cursor } from './types'

const axiosNoRetry = axios.create({ timeout: 5000 })

export interface ServiceArgs {
  blockbook: Blockbook
  rpcUrl: string
  rpcApiKey?: string
  isXpub: (pubkey: string) => boolean
  addressFormatter?: AddressFormatter
}

export class Service implements Omit<BaseAPI, 'getInfo'>, API {
  readonly isXpub: (pubkey: string) => boolean

  private readonly blockbook: Blockbook
  private readonly rpcUrl: string
  private readonly rpcApiKey?: string

  private formatAddress: AddressFormatter = (address: string) => address.toLowerCase()

  constructor(args: ServiceArgs) {
    this.blockbook = args.blockbook
    this.isXpub = args.isXpub
    this.rpcUrl = args.rpcUrl
    this.rpcApiKey = args.rpcApiKey

    if (args.addressFormatter) this.formatAddress = args.addressFormatter
  }

  async getAccount(pubkey: string): Promise<Account> {
    try {
      const data = await (() => {
        if (this.isXpub(pubkey)) {
          return this.blockbook.getXpub(pubkey, undefined, undefined, undefined, undefined, 'tokenBalances', 'derived')
        }

        const address = this.formatAddress(pubkey)
        return this.blockbook.getAddress(address, undefined, undefined, undefined, undefined, 'basic')
      })()

      // list of all used addresses with additional derived addresses up to gap limit of 20, including any detected balances
      const addresses = data.tokens?.map<Address>((token) => ({
        balance: token.balance ?? '0',
        pubkey: token.name,
      })) ?? [
        {
          balance: data.balance,
          pubkey: data.address,
        },
      ]

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
    validatePageSize(pageSize)

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

        const address = this.formatAddress(pubkey)
        return this.blockbook.getAddress(address, curCursor.page, pageSize, undefined, undefined, 'txs')
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
      return data.map((utxo) => {
        if (utxo.address) return utxo
        return { ...utxo, address: pubkey }
      })
    } catch (err) {
      throw handleError(err)
    }
  }

  async sendTx(body: SendTxBody): Promise<string> {
    try {
      const request: RPCRequest = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'sendrawtransaction',
        params: [body.hex],
      }

      const config = this.rpcApiKey ? { headers: { 'api-key': this.rpcApiKey } } : undefined
      const { data } = await axiosNoRetry.post<RPCResponse>(this.rpcUrl, request, config)

      if (!data.result) throw new Error(JSON.stringify(data.error))

      return data.result as string
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
          satsPerKiloByte: new BN(result[index]).times(100000000).toNumber(),
        }
        return { ...prev, [key]: networkFee }
      }, {})
    } catch (err) {
      throw handleError(err)
    }
  }

  async handleBlock(hash: string): Promise<Array<BlockbookTx>> {
    try {
      const { txs = [], totalPages = 1 } = await this.blockbook.getBlock(hash)
      for (let page = 1; page < totalPages; ++page) {
        const data = await this.blockbook.getBlock(hash, page)
        data.txs && txs.push(...data.txs)
      }
      return txs
    } catch (err) {
      throw handleError(err)
    }
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
