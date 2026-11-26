import { Logger } from '@shapeshiftoss/logger'
import { ConnectionHandler } from './websocket'

export type AddressFormatter = (address: string) => string
export type AddressValidator = (address: string) => boolean
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BlockHandler<T = any, T2 = Array<unknown>> = (block: T) => Promise<{ txs: T2 }>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TransactionHandler<T = any, T2 = unknown> = (tx: T) => Promise<{ addresses: Array<string>; tx: T2 }>

const isTxWithAddresses = (tx: unknown): tx is { addresses: Array<string>; tx: unknown } => {
  return 'addresses' in (tx as { addresses: string; tx: unknown })
}

export interface RegistryArgs {
  addressFormatter?: AddressFormatter
  /** Returns true if the (formatted) address is a valid address for the chain. Invalid addresses are not registered. */
  addressValidator?: AddressValidator
  blockHandler?: BlockHandler
  transactionHandler: TransactionHandler
}

/**
 * The registry keeps track of all client websocket connections and their associated addresses that have been registered.
 * Upon receiving new block or transaction messages from the server side websocket connection to the node,
 * unchained transaction payloads will be sent to any clients that have an address registered that was found in the transaction.
 */
export class Registry {
  // Map (not plain objects) so that client supplied strings can never collide with inherited object properties
  private clients = new Map<string, Set<string>>()
  private addresses = new Map<string, Map<string, ConnectionHandler>>()

  private handleBlock?: BlockHandler
  private handleTransaction: TransactionHandler
  private formatAddress: AddressFormatter = (address: string) => address.toLowerCase()
  private validateAddress: AddressValidator = () => true

  private logger = new Logger({ namespace: ['unchained', 'common', 'api', 'registry'], level: process.env.LOG_LEVEL })

  constructor(args: RegistryArgs) {
    this.handleBlock = args.blockHandler
    this.handleTransaction = args.transactionHandler

    if (args.addressFormatter) this.formatAddress = args.addressFormatter
    if (args.addressValidator) this.validateAddress = args.addressValidator
  }

  private static toId(clientId: string, subscriptionId: string): string {
    return `${clientId}:${subscriptionId}`
  }

  private static fromId(id: string): { clientId: string; subscriptionId: string } {
    const [clientId, subscriptionId] = id.split(':')
    return { clientId, subscriptionId }
  }

  getAddresses(): Array<string> {
    return Array.from(this.addresses.keys())
  }

  /**
   * Format and validate a client supplied address
   *
   * @returns the formatted address, or undefined if the address is not valid for this chain
   */
  toValidAddress(address: unknown): string | undefined {
    if (typeof address !== 'string' || !address) return

    try {
      const formatted = this.formatAddress(address)
      if (!formatted || !this.validateAddress(formatted)) return
      return formatted
    } catch (err) {
      return
    }
  }

  /**
   * Subscribe to new pending/confirmed transactions for addresses by clientId
   *
   * @param clientId unique client uuid
   * @param subscriptionId unique identifier for a set of addresses
   * @param connection websocket client connection
   * @param addresses list of addresses to subscribe to (invalid addresses are ignored)
   */
  subscribe(
    clientId: string,
    subscriptionId: string,
    connection: ConnectionHandler,
    addresses: Array<string>
  ): Array<string> {
    const id = Registry.toId(clientId, subscriptionId)

    const subscribedAddresses: Array<string> = []

    for (const rawAddress of addresses) {
      const address = this.toValidAddress(rawAddress)
      if (!address) continue

      let clientAddresses = this.clients.get(id)
      if (!clientAddresses) {
        clientAddresses = new Set<string>()
        this.clients.set(id, clientAddresses)
      }

      let connections = this.addresses.get(address)
      if (!connections) {
        connections = new Map<string, ConnectionHandler>()
        this.addresses.set(address, connections)
        subscribedAddresses.push(address)
      }

      clientAddresses.add(address)
      connections.set(id, connection)
    }

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

    const clientAddresses = this.clients.get(id)
    if (!clientAddresses) return []

    const unsubscribedAddresses: Array<string> = []

    // addresses stored in the registry are already formatted, so only client supplied addresses are formatted
    const toUnregister = addresses.length
      ? addresses.map((address) => this.toValidAddress(address)).filter((address): address is string => !!address)
      : Array.from(clientAddresses)

    for (const address of toUnregister) {
      // unregister address from client
      if (!clientAddresses.delete(address)) continue

      const connections = this.addresses.get(address)
      if (!connections) continue

      // unregister client from address
      connections.delete(id)

      // delete address from registery if no clients are registered anymore
      if (!connections.size) {
        this.addresses.delete(address)
        unsubscribedAddresses.push(address)
      }
    }

    // delete client from registery if no addresses are registered anymore
    if (!clientAddresses.size) this.clients.delete(id)

    return unsubscribedAddresses
  }

  async onBlock(msg: unknown): Promise<void> {
    if (!this.handleBlock) return
    if (!this.clients.size) return

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
    if (!this.clients.size) return

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

      const connections = this.addresses.get(address)
      if (!connections) return

      for (const [id, connection] of connections.entries()) {
        const { subscriptionId } = Registry.fromId(id)
        connection.publish(subscriptionId, { address, data: tx })
      }
    })
  }
}
