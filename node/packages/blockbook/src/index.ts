import { Tx } from './models'

export { Blockbook } from './controller'
export * from './models'
export * from './websocket'

export interface NewBlock {
  height: number
  hash: string
}

export interface NewTx {
  address: string
  tx: Tx
}

export interface SubscriptionResponse {
  subscribed: boolean
}

export interface WebsocketRepsonse {
  id: string
  data: NewBlock | NewTx | SubscriptionResponse
}

/**
 * returns a unique set of all addresses found in the associated blockbook transaction
 */
export function getAddresses(tx: Tx): Array<string> {
  const addresses: Array<string> = []

  tx.vin?.forEach((vin) => {
    if (!vin.isAddress) return
    if (!vin.addresses) return

    addresses.push(...vin.addresses)
  })

  tx.vout?.forEach((vout) => {
    if (!vout.isAddress) return
    if (!vout.addresses) return

    addresses.push(...vout.addresses)
  })

  tx.tokenTransfers?.forEach((transfer) => {
    transfer.from && addresses.push(transfer.from)
    transfer.to && addresses.push(transfer.to)
  })

  return [...new Set(addresses)]
}
