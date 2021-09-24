import { Message } from '@shapeshiftoss/common-ingester'

export interface RegisterClientData {
  address: string
  blockNumber?: number
}

export interface WebsocketError {
  type: 'error'
  message: string
}

export interface Subscription {
  method: 'subscribe' | 'unsubscribe'
  topic: string
  data: RegisterClientData
}

export const onMessage = async (message: any, connection: any, rabbitConn: any, id: string) => {
  try {
    const payload = JSON.parse(message.toString()) as Subscription
    switch (payload.method) {
      case 'subscribe': {
        switch (payload.topic) {
          case 'txs': {
            await txs(connection, rabbitConn, payload.data, id)
            break
          }
          default: {
            const error: WebsocketError = {
              type: 'error',
              message: 'topic not supported',
            }
            connection.send(JSON.stringify(error))
          }
        }
        break
      }
      case 'unsubscribe': {
        console.log('unsubscribe')
        break
      }
      default: {
        const error: WebsocketError = {
          type: 'error',
          message: 'method not supported',
        }
        connection.send(JSON.stringify(error))
      }
    }
  } catch (err) {
    console.log('err', err)
    connection.emit('bad payload')
  }
}

export const txs = async (connection: any, rabbitConn: any, data: RegisterClientData, id: string) => {
  if (!data.address) {
    const error: WebsocketError = {
      type: 'error',
      message: 'address required',
    }
    connection.send(JSON.stringify(error))
    return
  }

  const registryExchange = rabbitConn.declareExchange('exchange.unchained', '', { noCreate: true })

  // Create dynamic queue with topic client_id binding
  const txExchange = rabbitConn.declareExchange('exchange.ethereum.tx.client', '', { noCreate: true })

  const queue = rabbitConn.declareQueue(`queue.ethereum.tx.${id}`)
  console.log('created queue:', queue.name)
  queue.bind(txExchange, id)

  await rabbitConn.completeConfiguration()

  const msg = new Message({
    client_id: id,
    action: 'register',
    registration: {
      addresses: [data.address],
    },
  })

  // Register account with unique uuid and associated address. Update ingester_meta with the appropriate block height
  // Trigger initial sync with fake "mempool" transaction (see ingester/register.ts)
  registryExchange.send(msg, 'ethereum.registry')

  const onMessage = () => async (message: Message) => {
    const content = message.getContent()
    // Send all messages back over websocket to client
    connection.send(JSON.stringify(content))
  }

  // Create a Worker to consume from dynamic queue created above
  queue.activateConsumer(onMessage())
}
