import { BigNumber } from 'bignumber.js'
import { ethers } from 'ethers'
import { Tx } from '@shapeshiftoss/blockbook'
import { caip19, caip2 } from '@shapeshiftoss/caip'
import { ChainTypes, ContractTypes } from '@shapeshiftoss/types'
import { Status, Token, TransferType, Tx as ParseTx, TxSpecific } from '../types'
import { aggregateTransfer, findAsyncSequential } from '../utils'
import { InternalTx, Network } from './types'
import { getBuyTx, getSellTx, getSigHash, toNetworkType } from './utils'
import * as multiSig from './multiSig'
import * as thor from './thor'
import * as uniV2 from './uniV2'
import * as zrx from './zrx'
import * as yearn from './yearn'

export * from './types'

export interface TransactionParserArgs {
  network?: Network
  midgardUrl: string
  rpcUrl: string
}

export interface GenericParser {
  parse: (tx: Tx) => Promise<Partial<TxSpecific<ParseTx>> | undefined>
}

export class TransactionParser {
  network: Network

  private readonly thor: thor.Parser
  private readonly uniV2: uniV2.Parser
  private readonly zrx: zrx.Parser
  private readonly yearn: yearn.Parser
  private readonly parsers: Array<GenericParser>

  constructor(args: TransactionParserArgs) {
    const provider = new ethers.providers.JsonRpcProvider(args.rpcUrl)

    this.network = args.network ?? 'mainnet'

    this.thor = new thor.Parser({ network: this.network, midgardUrl: args.midgardUrl, rpcUrl: args.rpcUrl })
    this.uniV2 = new uniV2.Parser({ network: this.network, provider })
    this.zrx = new zrx.Parser()
    this.yearn = new yearn.Parser()

    this.parsers = [this.zrx, this.thor, this.uniV2, this.yearn]
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
    // We expect only one Parser to return a result. If multiple do, we take the first and early exit.
    const contractParserResult = await findAsyncSequential<GenericParser, TxSpecific<ParseTx>>(
      this.parsers,
      async (parser) => await parser.parse(tx)
    )

    const parsedTx: ParseTx = {
      address,
      blockHash: tx.blockHash,
      blockHeight: tx.blockHeight,
      blockTime: tx.blockTime,
      caip2: caip2.toCAIP2({ chain: ChainTypes.Ethereum, network: toNetworkType(this.network) }),
      confirmations: tx.confirmations,
      status: TransactionParser.getStatus(tx),
      trade: contractParserResult?.trade,
      transfers: contractParserResult?.transfers ?? [],
      txid: tx.txid,
      value: tx.value,
      data: contractParserResult?.data,
    }

    const parsedTxWithTransfers = this.getParsedTxWithTransfers(tx, parsedTx, address, internalTxs)

    // Add metadata and return
    return {
      ...parsedTxWithTransfers,
      // TODO - Should shared logic actually live here?
      // TODO - What to do with duplicate data
      data: {
        ...parsedTxWithTransfers.data,
        buyTx: getBuyTx(parsedTxWithTransfers),
        sellTx: getSellTx(parsedTxWithTransfers),
      },
    }
  }

  private getStatus(tx: Tx): Status {
    const status = tx.ethereumSpecific?.status

    if (status === -1 && tx.confirmations <= 0) return Status.Pending
    if (status === 1 && tx.confirmations > 0) return Status.Confirmed
    if (status === 0) return Status.Failed

    return Status.Unknown
  }

  private getParsedTxWithTransfers(tx: Tx, parsedTx: ParseTx, address: string, internalTxs?: Array<InternalTx>) {
    const caip19Ethereum = caip19.toCAIP19({ chain: ChainTypes.Ethereum, network: toNetworkType(this.network) })
    const sendAddress = tx.vin[0].addresses?.[0] ?? ''
    const receiveAddress = tx.vout[0].addresses?.[0] ?? ''

    if (address === sendAddress) {
      // send amount
      const sendValue = new BigNumber(tx.value)
      if (sendValue.gt(0)) {
        parsedTx.transfers = aggregateTransfer(
          parsedTx.transfers,
          TransferType.Send,
          caip19Ethereum,
          sendAddress,
          receiveAddress,
          sendValue.toString(10)
        )
      }

      // network fee
      const fees = new BigNumber(tx.fees ?? 0)
      if (fees.gt(0)) {
        parsedTx.fee = { caip19: caip19Ethereum, value: fees.toString(10) }
      }
    }

    if (address === receiveAddress) {
      // receive amount
      const receiveValue = new BigNumber(tx.value)
      if (receiveValue.gt(0)) {
        parsedTx.transfers = aggregateTransfer(
          parsedTx.transfers,
          TransferType.Receive,
          caip19Ethereum,
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
        parsedTx.transfers = aggregateTransfer(parsedTx.transfers, TransferType.Send, ...transferArgs)
      }

      // token receive amount
      if (address === transfer.to) {
        parsedTx.transfers = aggregateTransfer(parsedTx.transfers, TransferType.Receive, ...transferArgs)
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
        parsedTx.transfers = aggregateTransfer(parsedTx.transfers, TransferType.Send, ...transferArgs)
      }

      // internal eth receive
      if (address === internalTx.to) {
        parsedTx.transfers = aggregateTransfer(parsedTx.transfers, TransferType.Receive, ...transferArgs)
      }
    })

    return parsedTx
  }
}
