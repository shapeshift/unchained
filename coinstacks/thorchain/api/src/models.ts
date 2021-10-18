/* unable to import models from a module with tsoa */
import { Account } from '../../../common/api/src'

export interface BroadcastTxResponse {
  txhash: string
}

export interface ThorchainTxs {
  total_count: string
  count: string
  page_number: string
  page_total: string
  limit: string
  txs: Array<ThorchainTx>
}
export interface AuthAccounts {
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
export interface BankBalances {
  height: string
  result: Array<ThorchainAmount>
}

/**
 * Contains additional thorchain specific info
 */
export interface ThorchainAccount extends Account {
  account_number: string
  sequence: string
}

export type ThorchainMsgType = 'thorchain/MsgDeposit' | 'thorchain/MsgSend'
export type ThorchainTxType = 'cosmos-sdk/StdTx' | 'thorchain/MsgSend'

export type ThorchainMsg = MsgSend | MsgDeposit

export interface ThorchainAmount {
  denom: string
  amount: string
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

export interface MsgSend {
  type: ThorchainMsgType
  value: {
    from_address: string
    to_address: string
    amount: Array<ThorchainAmount>
  }
}

export interface ThorchainSignature {
  pub_key: {
    type: string
    value: string
  }
  signature: string
}

export interface ThorchainFee {
  amount: Array<ThorchainAmount>
  gas: string
}

/**
 * Contains info about a transaction
 */
export interface ThorchainTx {
  height: string
  txhash: string
  data: string
  raw_log: string
  logs: Array<string> // todo - should be array of events
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

/**
 * Contains paginated transaction history
 */
export interface ThorchainTxHistory {
  page: number
  totalPages: number
  txs: number
  transactions: Array<ThorchainTx>
}

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

/**
 * ThorchainAPI coin specific implementation
 */
export interface ThorchainAPI {
  /**
   * Get the estimated gas cost of a transaction
   *
   * @param {string} data input data
   * @param {string} to to address
   * @param {string} value transaction value
   *
   * @returns {Promise<string>} estimated gas to be used for the transaction
   */
  //@Get('/gas/estimate')
  estimateGas(data: string, to: string, value: string): Promise<string>

  /**
   * Get the current gas price from the node
   *
   * @returns {Promise<string>} current gas price in wei
   */
  // @Get('/gas/price')
  getGasPrice(): Promise<string>
}
