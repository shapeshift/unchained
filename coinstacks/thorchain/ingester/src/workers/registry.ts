import { Tx } from '@shapeshiftoss/blockbook'
import { Worker, Message } from '@shapeshiftoss/common-ingester'
import { RegistryDocument, RegistryService } from '@shapeshiftoss/common-mongo'
import { logger } from '@shapeshiftoss/logger'

const MONGO_DBNAME = process.env.MONGO_DBNAME
const MONGO_URL = process.env.MONGO_URL

if (!MONGO_DBNAME) throw new Error('MONGO_DBNAME env var not set')
if (!MONGO_URL) throw new Error('MONGO_URL env var not set')

interface RegistryMessage extends RegistryDocument {
  action: string
}

const registry = new RegistryService(MONGO_URL, MONGO_DBNAME)

const onMessage = (worker: Worker) => async (message: Message) => {
  let document: RegistryDocument | undefined
  try {
    const msg: RegistryMessage = JSON.parse(message.getContent())

    // sanitize document to ensure document.registration.pubkey is set
    const document = registry.sanitizeDocument(msg)

    if (msg.action === 'register') {
      await registry.add(msg)

      document.registration.addresses?.forEach((address) => {
        const tx: Tx = {
          txid: `register-${Date.now()}`,
          vin: [{ n: 0, addresses: [address], isAddress: true }],
          vout: [],
          blockHeight: 0,
          confirmations: 0,
          blockTime: Date.now(),
          value: '',
        }

        logger.debug(`${address} registered, starting account delta sync...`)

        worker.exchange?.send(new Message(tx), 'tx')
      })
    }

    if (msg.action === 'unregister') {
      if (msg.registration.addresses) {
        await registry.remove(msg)
      } else {
        await registry.delete(msg)
      }
    }

    worker.ackMessage(message, document.registration.pubkey)
  } catch (err) {
    logger.error('onMessage.error:', err)
    worker.retryMessage(message, document?.registration.pubkey as string)
  }
}

const main = async () => {
  const worker = await Worker.init({
    queueName: 'queue.thorchain.registry',
    exchangeName: 'exchange.thorchain.tx',
  })

  worker.queue?.prefetch(1)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()
