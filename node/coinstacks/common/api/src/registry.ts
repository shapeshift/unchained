import { Logger } from '@shapeshiftoss/logger'
import { ConnectionHandler } from './websocket'

export type AddressFormatter = (address: string) => string
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type BlockHandler<T = any, T2 = any> = (block: T) => Promise<{ txs: T2 }>
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type TransactionHandler<T = any, T2 = any> = (tx: T) => Promise<{ addresses: Array<string>; tx: T2 }>

export interface RegistryArgs {
  addressFormatter?: AddressFormatter
  blockHandler: BlockHandler
  transactionHandler: TransactionHandler
}

export class Registry {
  private clients: Record<string, Map<string, void>>
  private addresses: Record<string, Map<string, ConnectionHandler>>

  private handleBlock: BlockHandler
  private handleTransaction: TransactionHandler
  private formatAddress: AddressFormatter = (address: string) => address.toLowerCase()

  private logger = new Logger({ namespace: ['unchained', 'common', 'api', 'registry'], level: process.env.LOG_LEVEL })

  constructor(args: RegistryArgs) {
    this.clients = {}
    this.addresses = {}

    this.handleBlock = args.blockHandler
    this.handleTransaction = args.transactionHandler

    if (args.addressFormatter) this.formatAddress = args.addressFormatter
  }

  private toId(clientId: string, subscriptionId: string): string {
    return `${clientId}:${subscriptionId}`
  }

  private fromId(id: string): { clientId: string; subscriptionId: string } {
    const [clientId, subscriptionId] = id.split(':')
    return { clientId, subscriptionId }
  }

  subscribe(clientId: string, subscriptionId: string, connection: ConnectionHandler, addresses: Array<string>) {
    const id = this.toId(clientId, subscriptionId)

    if (!this.clients[id]) this.clients[id] = new Map<string, void>()

    addresses.forEach((address) => {
      address = this.formatAddress(address)

      if (!this.addresses[address]) this.addresses[address] = new Map<string, ConnectionHandler>()

      this.clients[id].set(address)
      this.addresses[address].set(id, connection)
    })
  }

  unsubscribe(clientId: string, subscriptionId: string, addresses: Array<string>) {
    const id = this.toId(clientId, subscriptionId)

    if (!this.clients[id]) return

    const unregister = (id: string, address: string) => {
      address = this.formatAddress(address)

      // unregister address from client
      this.clients[id].delete(address)

      // delete client from registery if no addresses are registered anymore
      if (!this.clients[id].size) delete this.clients[id]

      if (this.addresses[address]) {
        // unregister client from address
        this.addresses[address].delete(id)

        // delete address from registery if no clients are registered anymore
        if (!this.addresses[address].size) delete this.addresses[address]
      }
    }

    if (!addresses.length) {
      for (const address of this.clients[id].keys()) {
        unregister(id, address)
      }
    } else {
      for (const address of addresses) {
        unregister(id, address)
      }
    }
  }

  async onBlock(msg: unknown): Promise<void> {
    if (!Object.keys(this.clients).length) return

    try {
      const { txs } = await this.handleBlock(msg)

      txs.forEach((tx: unknown) => this.onTransaction(tx))
    } catch (err) {
      this.logger.error(err, 'failed to handle block')
    }
  }

  async onTransaction(msg: unknown): Promise<void> {
    if (!Object.keys(this.clients).length) return

    try {
      const { addresses, tx } = await this.handleTransaction(msg)

      addresses.forEach((address) => {
        address = this.formatAddress(address)

        if (!this.addresses[address]) return

        for (const [id, connection] of this.addresses[address].entries()) {
          const { subscriptionId } = this.fromId(id)
          connection.publish(subscriptionId, address, tx)
        }
      })
    } catch (err) {
      this.logger.error(err, 'failed to handle transaction')
    }
  }
}
