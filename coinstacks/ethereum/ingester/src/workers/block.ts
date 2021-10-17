import { Worker, Message } from '@shapeshiftoss/common-ingester'
import { logger } from '@shapeshiftoss/logger'
import { ETHBlock } from '../types'

const NETWORK = process.env.NETWORK

if (!NETWORK) throw new Error('NETWORK env var not set')

const asset = NETWORK !== 'mainnet' ? `ethereum-${NETWORK}` : 'ethereum'

const onMessage = (worker: Worker) => (message: Message) => {
  const block: ETHBlock = message.getContent()
  logger.debug(`block: (${Number(block.number)}) ${block.hash}`)

  block.transactions.forEach((txid) => worker.sendMessage(new Message(txid), 'txid'))

  worker.ackMessage(message)
}

const main = async () => {
  const worker = await Worker.init({
    queueName: `queue.${asset}.block`,
    exchangeName: `exchange.${asset}.txid`,
  })

  worker.queue?.prefetch(1)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()
