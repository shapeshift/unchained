/* unable to import models from a module with tsoa */
import { Account } from '../../../common/api/src'

/**
 * Thornode API
 */

export interface AuthAccountsResponse {
  height: string
  result: {
    type: string
    value: {
      address: string
      public_key: {
        type: string
        value: string
      }
      account_number: string
      sequence: string
    }
  }
}

export interface BankBalancesResponse {
  height: string
  result: Array<ThorchainAmount>
}

export interface BroadcastTxResponse {
  txhash: string
}
export interface ThorchainTxsResponse {
  total_count: string
  count: string
  page_number: string
  page_total: string
  limit: string
  txs: Array<ThorchainTx>
}

export interface ThorchainTx {
  height: string
  txhash: string
  data: string
  raw_log: string
  logs: Array<string>
  gas_wanted: string
  gas_used: string
  tx: {
    type: ThorchainTxType
    value: {
      msg: Array<ThorchainMsg>
      fee: ThorchainFee
      signatures: Array<ThorchainSignature>
      memo: string
      timeout_height: string
    }
  }
  timestamp: string
}

export type ThorchainTxType = 'cosmos-sdk/StdTx' | 'thorchain/MsgSend'
export type ThorchainMsg = MsgSend | MsgDeposit

export interface MsgSend {
  type: ThorchainMsgType
  value: {
    from_address: string
    to_address: string
    amount: Array<ThorchainAmount>
  }
}

export interface MsgDeposit {
  type: ThorchainMsgType
  value: {
    coins: [
      {
        asset: string
        amount: string
      }
    ]
    memo: string
    signer: string
  }
}

export type ThorchainMsgType = 'thorchain/MsgDeposit' | 'thorchain/MsgSend'
export interface ThorchainSignature {
  pub_key: {
    type: string
    value: string
  }
  signature: string
}

export interface ThorchainAmount {
  denom: string
  amount: string
}

export interface ThorchainFee {
  amount: Array<ThorchainAmount>
  gas: string
}

/**
 * Unchained API Responses
 */

export interface ThorchainTxHistory {
  page: number
  totalPages: number
  txs: number
  transactions: Array<ThorTx>
}

export interface ThorchainAccount extends Account {
  balance: string
  account_number: string
  sequence: string
  pubkey: string
}

export interface ThorTx {
  txid: string
  status: string
  from: string
  to: string
  blockHash: string
  blockHeight: number
  confirmations: number
  timestamp: number
  value: string
  fee: string
}

/**
 * Unchained API Requests
 */
export interface ThorchainSendTxBody {
  tx: {
    memo: string
    fee: ThorchainFee
    msg: Array<MsgSend>
    signatures: Array<ThorchainSignature>
  }
  mode: string
  type: string
}
