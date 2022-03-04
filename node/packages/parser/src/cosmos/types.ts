interface Value {
  amount: string
  denom: string
}

interface Message {
  from?: string
  to?: string
  type: string
  value?: Value
}

interface Attribute {
  key: string
  value: string
}

interface Event {
  type: string
  attributes: Array<Attribute>
}

export interface Tx {
  txid: string
  blockHash?: string
  blockHeight?: string
  timestamp?: string
  fee: Value
  gasUsed: string
  gasWanted: string
  index: number
  memo?: string
  value: string
  messages: Array<Message>
  events: Array<Event>
}
