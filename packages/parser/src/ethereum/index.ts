import { BigNumber } from 'bignumber.js'
import { ethers } from 'ethers'
import { Tx } from '@shapeshiftoss/blockbook'
import { caip2, caip19 } from '@shapeshiftoss/caip'
import { ChainTypes, ContractTypes, NetworkTypes } from '@shapeshiftoss/types'
import { Tx as ParseTx, TxSpecific as ParseTxSpecific, Token, TransferType, Transfer } from '../types'
import { InternalTx, Network } from './types'
import { getSigHash } from './utils'
import * as multiSig from './multiSig'
import * as thor from './thor'
import * as uniV2 from './uniV2'
import * as zrx from './zrx'

export interface TransactionParserArgs {
  network?: Network
  midgardUrl: string
  rpcUrl: string
}

export class TransactionParser {
  network: Network

  private thor: thor.Parser
  private uniV2: uniV2.Parser
  private zrx: zrx.Parser

  constructor(args: TransactionParserArgs) {
    const provider = new ethers.providers.JsonRpcProvider(args.rpcUrl)

    this.network = args.network ?? NetworkTypes.MAINNET

    this.thor = new thor.Parser({ network: this.network, midgardUrl: args.midgardUrl })
    this.uniV2 = new uniV2.Parser({ network: this.network, provider })
    this.zrx = new zrx.Parser()
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

    let result: ParseTxSpecific | undefined
    switch (receiveAddress) {
      case zrx.PROXY_CONTRACT: {
        result = this.zrx.parse(tx)
        break
      }
      case this.thor.routerContract: {
        result = await this.thor.parse(tx)
        break
      }
      case uniV2.ROUTER_CONTRACT: {
        result = await this.uniV2.parse(tx)
        break
      }
    }

    const pTx: ParseTx = {
      address,
      blockHash: tx.blockHash,
      blockHeight: tx.blockHeight,
      blockTime: tx.blockTime,
      caip2: caip2.toCAIP2({ chain: ChainTypes.Ethereum, network: this.network }),
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
          caip19.toCAIP19({ chain: ChainTypes.Ethereum, network: this.network }),
          sendAddress,
          receiveAddress,
          sendValue.toString(10)
        )
      }

      // network fee
      const fees = new BigNumber(tx.fees ?? 0)
      if (fees.gt(0)) {
        pTx.fee = {
          caip19: caip19.toCAIP19({ chain: ChainTypes.Ethereum, network: this.network }),
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
          caip19.toCAIP19({ chain: ChainTypes.Ethereum, network: this.network }),
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
      }

      const transferArgs = [
        caip19.toCAIP19({
          chain: ChainTypes.Ethereum,
          network: this.network,
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
        caip19.toCAIP19({ chain: ChainTypes.Ethereum, network: this.network }),
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
}
