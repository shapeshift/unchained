import { BigNumber } from 'bignumber.js'
import { ethers } from 'ethers'
import { Tx } from '@shapeshiftoss/blockbook'
import { caip19, caip2 } from '@shapeshiftoss/caip'
import { ChainTypes, ContractTypes } from '@shapeshiftoss/types'
import { Status, Token, Transfer, TransferType, Tx as ParseTx } from '../types'
import { InternalTx, Network } from './types'
import { getSigHash, toNetworkType } from './utils'
import * as multiSig from './multiSig'
import * as thor from './thor'
import * as uniV2 from './uniV2'
import * as zrx from './zrx'

export * from './types'

export interface TransactionParserArgs {
  network?: Network
  midgardUrl: string
  rpcUrl: string
}

export type Parser = thor.Parser | uniV2.Parser | zrx.Parser

export class TransactionParser {
  network: Network

  private readonly thor: thor.Parser
  private readonly uniV2: uniV2.Parser
  private readonly zrx: zrx.Parser
  private readonly parsers: Array<Parser>

  constructor(args: TransactionParserArgs) {
    const provider = new ethers.providers.JsonRpcProvider(args.rpcUrl)

    this.network = args.network ?? 'mainnet'

    this.thor = new thor.Parser({ network: this.network, midgardUrl: args.midgardUrl, rpcUrl: args.rpcUrl })
    this.uniV2 = new uniV2.Parser({ network: this.network, provider })
    this.zrx = new zrx.Parser()

    this.parsers = [this.zrx, this.thor, this.uniV2]
  }

  // return any addresses that can be detected
  getInternalAddress(inputData: string): string | undefined {
    switch (getSigHash(inputData)) {
      case this.thor.transferOutSigHash:
        return this.thor.getInternalAddress(inputData)
      case multiSig.SENDMULTISIG_SIG_HASH:
        return multiSig.getInternalAddress(inputData)
      default:
        return
    }
  }

  async parse(tx: Tx, address: string, internalTxs?: Array<InternalTx>): Promise<ParseTx> {
    const sendAddress = tx.vin[0].addresses?.[0] ?? ''
    const receiveAddress = tx.vout[0].addresses?.[0] ?? ''

    const parserResults = await Promise.all(this.parsers.map(async (parser) => await parser.parse(tx)))
    // We expect only one result - though if there are more than one we'll take the first we find.
    const result = parserResults.find((result) => result)

    const pTx: ParseTx = {
      address,
      blockHash: tx.blockHash,
      blockHeight: tx.blockHeight,
      blockTime: tx.blockTime,
      caip2: caip2.toCAIP2({ chain: ChainTypes.Ethereum, network: toNetworkType(this.network) }),
      confirmations: tx.confirmations,
      status: this.getStatus(tx),
      trade: result?.trade,
      transfers: result?.transfers ?? [],
      txid: tx.txid,
      value: tx.value,
    }

    if (address === sendAddress) {
      // send amount
      const sendValue = new BigNumber(tx.value)
      if (sendValue.gt(0)) {
        pTx.transfers = this.aggregateTransfer(
          pTx.transfers,
          TransferType.Send,
          caip19.toCAIP19({ chain: ChainTypes.Ethereum, network: toNetworkType(this.network) }),
          sendAddress,
          receiveAddress,
          sendValue.toString(10)
        )
      }

      // network fee
      const fees = new BigNumber(tx.fees ?? 0)
      if (fees.gt(0)) {
        pTx.fee = {
          caip19: caip19.toCAIP19({ chain: ChainTypes.Ethereum, network: toNetworkType(this.network) }),
          value: fees.toString(10),
        }
      }
    }

    if (address === receiveAddress) {
      // receive amount
      const receiveValue = new BigNumber(tx.value)
      if (receiveValue.gt(0)) {
        pTx.transfers = this.aggregateTransfer(
          pTx.transfers,
          TransferType.Receive,
          caip19.toCAIP19({ chain: ChainTypes.Ethereum, network: toNetworkType(this.network) }),
          sendAddress,
          receiveAddress,
          receiveValue.toString(10)
        )
      }
    }

    tx.tokenTransfers?.forEach((transfer) => {
      // FTX Token (FTT) name and symbol was set backwards on the ERC20 contract
      if (transfer.token == '0x50D1c9771902476076eCFc8B2A83Ad6b9355a4c9') {
        transfer.name = transfer.symbol
        transfer.symbol = transfer.name
      }

      const token: Token = {
        contract: transfer.token,
        decimals: transfer.decimals,
        name: transfer.name,
        symbol: transfer.symbol,
      }

      const transferArgs = [
        caip19.toCAIP19({
          chain: ChainTypes.Ethereum,
          network: toNetworkType(this.network),
          contractType: ContractTypes.ERC20,
          tokenId: transfer.token,
        }),
        transfer.from,
        transfer.to,
        transfer.value,
        token,
      ] as const

      // token send amount
      if (address === transfer.from) {
        pTx.transfers = this.aggregateTransfer(pTx.transfers, TransferType.Send, ...transferArgs)
      }

      // token receive amount
      if (address === transfer.to) {
        pTx.transfers = this.aggregateTransfer(pTx.transfers, TransferType.Receive, ...transferArgs)
      }
    })

    internalTxs?.forEach((internalTx) => {
      const transferArgs = [
        caip19.toCAIP19({ chain: ChainTypes.Ethereum, network: toNetworkType(this.network) }),
        internalTx.from,
        internalTx.to,
        internalTx.value,
      ] as const

      // internal eth send
      if (address === internalTx.from) {
        pTx.transfers = this.aggregateTransfer(pTx.transfers, TransferType.Send, ...transferArgs)
      }

      // internal eth receive
      if (address === internalTx.to) {
        pTx.transfers = this.aggregateTransfer(pTx.transfers, TransferType.Receive, ...transferArgs)
      }
    })

    return pTx
  }

  // keep track of all individual tx components and add up the total value transferred by to/from address
  private aggregateTransfer(
    transfers: Array<Transfer>,
    type: TransferType,
    caip19: string,
    from: string,
    to: string,
    value: string,
    token?: Token
  ): Array<Transfer> {
    if (!new BigNumber(value).gt(0)) return transfers

    const index = transfers?.findIndex((t) => t.type === type && t.caip19 === caip19 && t.from === from && t.to === to)
    const transfer = transfers?.[index]

    if (transfer) {
      transfer.totalValue = new BigNumber(transfer.totalValue).plus(value).toString(10)
      transfer.components.push({ value: value })
      transfers[index] = transfer
    } else {
      transfers = [...transfers, { type, caip19, from, to, totalValue: value, components: [{ value: value }], token }]
    }

    return transfers
  }

  private getStatus(tx: Tx): Status {
    const status = tx.ethereumSpecific?.status

    if (status === -1 && tx.confirmations <= 0) return Status.Pending
    if (status === 1 && tx.confirmations > 0) return Status.Confirmed
    if (status === 0) return Status.Failed

    return Status.Unknown
  }
}
