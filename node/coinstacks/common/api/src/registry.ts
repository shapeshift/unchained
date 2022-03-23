import WebSocket from 'ws'

export class Registry {
  private clients: Record<string, Array<string>>
  private addresses: Record<string, Record<string, () => void>>

  constructor() {
    this.clients = {}
    this.addresses = {}
  }

  subscribe(clientId: string, addresses: Array<string>) {
    console.log('client', this.clients.clientId)
    if (!this.clients[clientId]) {
      this.clients[clientId] = []
    }

    this.clients[clientId] = [...new Set([...this.clients[clientId], ...addresses])]

    addresses.forEach((address) => {
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

  handleMessage(msg: WebSocket.MessageEvent): void {
    if (!msg) return
  }
}
