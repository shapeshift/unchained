import WebSocket from 'ws'

export class Registry {
  private clients: Record<string, Map<string, void>>
  private addresses: Record<string, Record<string, () => void>>

  constructor() {
    this.clients = {}
    this.addresses = {}
  }

  subscribe(clientId: string, addresses: Array<string>) {
    console.log('client', this.clients.clientId)
    if (!this.clients[clientId]) {
      this.clients[clientId] = new Map<string, void>()
    }

    addresses.forEach((address) => {
      this.clients[clientId].set(address)
      this.addresses[address] = {
        [clientId]: () => {
          console.log('winning')
        },
      }
    })

    console.log(this.clients)
    console.log(this.clients[clientId])
    console.log(this.addresses)
    console.log(this.addresses['123'])
    console.log(this.addresses['123'][clientId]())
  }

  unsubscribe(clientId: string, addresses: Array<string>) {
    if (!this.clients[clientId]) {
      console.log('client not registered')
      return
    }
    //	unregister := func(clientID string, addr string) {
    //		// unregister address from client
    //		delete(r.clients[clientID], addr)
    //
    //		// unregister client from address
    //		delete(r.addresses[addr], clientID)
    //
    //		// delete address from registry if no clients are registered anymore
    //		if len(r.addresses[addr]) == 0 {
    //			delete(r.addresses, addr)
    //		}
    //	}
    //
    //	if len(addrs) == 0 {
    //		for addr := range r.clients[clientID] {
    //			unregister(clientID, addr)
    //		}
    //
    //		delete(r.clients, clientID)
    //	} else {
    //		for _, addr := range addrs {
    //			unregister(clientID, addr)
    //		}
    //	}

    const unregister = (clientId: string, address: string) => {
      // unregister address from client
      this.clients[clientId].delete(address)

      // unregister client from address
      delete this.addresses[address][clientId]

      // delete address from registery if no clients are registered anymore
      if (!this.addresses.length) delete this.addresses[address]
    }

    if (!addresses.length) {
      for (const address of this.clients[clientId].keys()) {
        unregister(clientId, address)
      }

      delete this.clients[clientId]
    } else {
      for (const address of this.clients[clientId].keys()) {
        unregister(clientId, address)
      }
    }
  }

  handleMessage(msg: WebSocket.MessageEvent): void {
    if (!msg) return
  }
}
