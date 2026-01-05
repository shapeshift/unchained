import { Logger } from '@shapeshiftoss/logger'
import { ConnectionHandler } from './websocket'

export type AddressFormatter = (address: string) => string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BlockHandler<T = any, T2 = Array<unknown>> = (block: T) => Promise<{ txs: T2 }>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TransactionHandler<T = any, T2 = unknown> = (tx: T) => Promise<{ addresses: Array<string>; tx: T2 }>

const isTxWithAddresses = (tx: unknown): tx is { addresses: Array<string>; tx: unknown } => {
  return 'addresses' in (tx as { addresses: string; tx: unknown })
}

export interface RegistryArgs {
  addressFormatter?: AddressFormatter
  blockHandler?: BlockHandler
  transactionHandler: TransactionHandler
}

/**
 * The registry keeps track of all client websocket connections and their associated addresses that have been registered.
 * Upon receiving new block or transaction messages from the server side websocket connection to the node,
 * unchained transaction payloads will be sent to any clients that have an address registered that was found in the transaction.
 */
export class Registry {
  private clients: Record<string, Set<string>> = {}
  private addresses: Record<string, Map<string, ConnectionHandler>> = {}

  private handleBlock?: BlockHandler
  private handleTransaction: TransactionHandler
  private formatAddress: AddressFormatter = (address: string) => address.toLowerCase()

  private logger = new Logger({ namespace: ['unchained', 'common', 'api', 'registry'], level: process.env.LOG_LEVEL })

  constructor(args: RegistryArgs) {
    this.handleBlock = args.blockHandler
    this.handleTransaction = args.transactionHandler

    if (args.addressFormatter) this.formatAddress = args.addressFormatter
  }

  private static toId(clientId: string, subscriptionId: string): string {
    return `${clientId}:${subscriptionId}`
  }

  private static fromId(id: string): { clientId: string; subscriptionId: string } {
    const [clientId, subscriptionId] = id.split(':')
    return { clientId, subscriptionId }
  }

  getAddresses(): Array<string> {
    return Object.keys(this.addresses)
  }

  /**
   * Subscribe to new pending/confirmed transactions for addresses by clientId
   *
   * @param clientId unique client uuid
   * @param subscriptionId unique identifier for a set of addresses
   * @param connection websocket client connection
   * @param addresses list of addresses to subscribe to
   */
  subscribe(
    clientId: string,
    subscriptionId: string,
    connection: ConnectionHandler,
    addresses: Array<string>
  ): Array<string> {
    const id = Registry.toId(clientId, subscriptionId)

    if (!this.clients[id]) this.clients[id] = new Set<string>()

    const subscribedAddresses: Array<string> = []

    addresses.forEach((address) => {
      address = this.formatAddress(address)

      if (!this.addresses[address]) {
        this.addresses[address] = new Map<string, ConnectionHandler>()
        subscribedAddresses.push(address)
      }

      this.clients[id].add(address)
      this.addresses[address].set(id, connection)
    })

    return subscribedAddresses
  }

  /**
   * Unsubscribe from new pending/confirmed transactions for addresses by clientId
   *
   * @param clientId unique client uuid
   * @param subscriptionId unique identifier for a set of addresses
   * @param addresses list of addresses to unsubscribe (empty array will unsubscribe from all currently registered addresses)
   */
  unsubscribe(clientId: string, subscriptionId: string, addresses: Array<string>): Array<string> {
    const id = Registry.toId(clientId, subscriptionId)

    if (!this.clients[id]) return []

    const unsubscribedAddresses: Array<string> = []

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
        if (!this.addresses[address].size) {
          delete this.addresses[address]
          unsubscribedAddresses.push(address)
        }
      }
    }

    if (!addresses.length) {
      for (const address of this.clients[id]) {
        unregister(id, address)
      }
    } else {
      for (const address of addresses) {
        unregister(id, address)
      }
    }

    return unsubscribedAddresses
  }

  async onBlock(msg: unknown): Promise<void> {
    if (!this.handleBlock) return
    if (!Object.keys(this.clients).length) return

    try {
      const { txs } = await this.handleBlock(msg)

      txs.forEach((tx: unknown) => {
        if (isTxWithAddresses(tx)) {
          this.publishTransaction(tx.addresses, tx.tx)
        } else {
          this.onTransaction(tx)
        }
      })
    } catch (err) {
      this.logger.error(err, 'failed to handle block')
    }
  }

  async onTransaction(msg: unknown): Promise<void> {
    if (!Object.keys(this.clients).length) return

    try {
      const { addresses, tx } = await this.handleTransaction(msg)
      this.publishTransaction(addresses, tx)
    } catch (err) {
      this.logger.error(err, 'failed to handle transaction')
    }
  }

  private publishTransaction(addresses: string[], tx: unknown) {
    addresses.forEach((address) => {
      address = this.formatAddress(address)

      if (!this.addresses[address]) return

      for (const [id, connection] of this.addresses[address].entries()) {
        const { subscriptionId } = Registry.fromId(id)
        connection.publish(subscriptionId, { address, data: tx })
      }
    })
  }
}
