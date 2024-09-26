import type { Account, API, Tx, TxHistory } from './models'
import { BaseAPI, handleError,  SendTxBody } from '@shapeshiftoss/common-api'
import { Helius } from "helius-sdk";

export interface ServiceArgs {
  rpcUrl: string
  rpcApiKey: string
}

export class Service implements Omit<BaseAPI, 'getInfo'>, API {
  private readonly heliusSdk: Helius

  constructor(args: ServiceArgs) {
    this.heliusSdk = new Helius(args.rpcApiKey)
  }

  async getTransaction(): Promise<Tx> {
    throw new Error('Method not implemented.')
  }

  async getAccount(): Promise<Account> {
    throw new Error('Method not implemented.')
  }

  async getTxHistory(): Promise<TxHistory> {
    throw new Error('Method not implemented.')
  }

  async sendTx(body: SendTxBody): Promise<string> {
    try {
      const txSig = await this.heliusSdk.connection.sendRawTransaction(Buffer.from(body.hex, 'base64'));

      return txSig
    } catch (err) {
      throw handleError(err)
    }
  }
}
