import { ConnectionHandler } from './websocket'

type FormatAddressFunc = (address: string) => string
type TransactionHandlerFunc<T = any, T2 = any> = (tx: T) => { addresses: Array<string>; tx: T2 }

export class Registry {
  private clients: Record<string, Map<string, void>>
  private addresses: Record<string, Map<string, ConnectionHandler>>

  private formatAddressFunc: FormatAddressFunc = (address: string) => address.toLowerCase()
  private transactionHandlerFunc?: TransactionHandlerFunc

  constructor() {
    this.clients = {}
    this.addresses = {}
  }

  private toId(clientId: string, subscriptionId: string): string {
    return `${clientId}:${subscriptionId}`
  }

  private fromId(id: string): { clientId: string; subscriptionId: string } {
    const [clientId, subscriptionId] = id.split(':')
    return { clientId, subscriptionId }
  }

  formatAddress(func: FormatAddressFunc): Registry {
    this.formatAddressFunc = func
    return this
  }

  transactionHandler<T, T2>(func: TransactionHandlerFunc<T, T2>): Registry {
    this.transactionHandlerFunc = func
    return this
  }

  subscribe(clientId: string, subscriptionId: string, connection: ConnectionHandler, addresses: Array<string>) {
    const id = this.toId(clientId, subscriptionId)

    if (!this.clients[id]) this.clients[id] = new Map<string, void>()

    addresses.forEach((address) => {
      address = this.formatAddressFunc(address)

      if (!this.addresses[address]) this.addresses[address] = new Map<string, ConnectionHandler>()

      this.clients[id].set(address)
      this.addresses[address].set(id, connection)
    })
  }

  unsubscribe(clientId: string, subscriptionId: string, addresses: Array<string>) {
    const id = this.toId(clientId, subscriptionId)

    if (!this.clients[id]) return

    const unregister = (id: string, address: string) => {
      address = this.formatAddressFunc(address)

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

      delete this.clients[id]
    } else {
      for (const address of addresses) {
        unregister(id, address)
      }
    }
  }

  handleMessage(msg: any): void {
    if (!this.transactionHandlerFunc) return

    const { addresses, tx } = this.transactionHandlerFunc(msg)

    addresses.forEach((address) => {
      address = this.formatAddressFunc(address)

      if (!this.addresses[address]) return

      for (const [id, connection] of this.addresses[address].entries()) {
        const { subscriptionId } = this.fromId(id)
        connection.publish(subscriptionId, address, tx)
      }
    })
  }
}
