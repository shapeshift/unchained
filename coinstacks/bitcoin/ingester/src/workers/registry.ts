import { Tx } from '@shapeshiftoss/blockbook'
import { Worker, Message } from '@shapeshiftoss/common-ingester'
import { RegistryDocument, RegistryService } from '@shapeshiftoss/common-mongo'
import { logger } from '../logger'

const MONGO_DBNAME = process.env.MONGO_DBNAME
const MONGO_URL = process.env.MONGO_URL

if (!MONGO_DBNAME) throw new Error('MONGO_DBNAME env var not set')
if (!MONGO_URL) throw new Error('MONGO_URL env var not set')

interface RegistryMessage extends RegistryDocument {
  action: string
}

const registry = new RegistryService(MONGO_URL, MONGO_DBNAME)

const msgLogger = logger.child({ namespace: ['workers', 'registry'], fn: 'onMessage' })
const onMessage = (worker: Worker) => async (message: Message) => {
  const msg: RegistryMessage = message.getContent()

  try {
    if (msg.action === 'register') {
      await registry.add(msg)

      msg.registration.addresses?.forEach((address) => {
        const tx: Tx = {
          txid: `register-${Date.now()}`,
          vin: [{ n: 0, addresses: [address], isAddress: true }],
          vout: [],
          blockHeight: 0,
          confirmations: 0,
          blockTime: Date.now(),
          value: '',
        }

        msgLogger.debug({ address }, 'Address registered')

        worker.exchange?.send(new Message(tx), 'tx')
      })
    }

    if (msg.action === 'unregister') {
      if (msg.registration.addresses?.length) {
        await registry.remove(msg)
      } else {
        await registry.delete(msg)
      }
    }

    worker.ackMessage(message, msg.client_id)
  } catch (err) {
    logger.error(err, 'Error processing registry message')
    worker.retryMessage(message, msg.client_id)
  }
}

const main = async () => {
  const worker = await Worker.init({
    queueName: 'queue.registry',
    exchangeName: 'exchange.tx',
  })

  worker.queue?.prefetch(1)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main().catch((err) => {
  logger.error(err)
  process.exit(1)
})
