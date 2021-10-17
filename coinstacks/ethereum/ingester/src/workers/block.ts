import { Worker, Message } from '@shapeshiftoss/common-ingester'
import { logger } from '@shapeshiftoss/logger'
import { ETHBlock } from '../types'

const ASSET = process.env.ASSET

if (!ASSET) throw new Error('ASSET env var not set')

const onMessage = (worker: Worker) => (message: Message) => {
  const block: ETHBlock = message.getContent()
  logger.debug(`block: (${Number(block.number)}) ${block.hash}`)

  block.transactions.forEach((txid) => worker.sendMessage(new Message(txid), 'txid'))

  worker.ackMessage(message)
}

const main = async () => {
  const worker = await Worker.init({
    queueName: `queue.${ASSET}.block`,
    exchangeName: `exchange.${ASSET}.txid`,
  })

  worker.queue?.prefetch(1)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()
