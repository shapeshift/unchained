import { Tx } from './models'

export { Blockbook } from './controller'
export * from './models'

export interface NewBlock {
  height: number
  hash: string
}

export interface SubscriptionResponse {
  subscribed: boolean
}

export interface WebsocketRepsonse {
  id: string
  data: NewBlock | Tx | SubscriptionResponse
}
