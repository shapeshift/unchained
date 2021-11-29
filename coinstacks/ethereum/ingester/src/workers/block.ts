import { Worker, Message } from '@shapeshiftoss/common-ingester'
import { logger } from '../logger'
import { ETHBlock } from '../types'

const msgLogger = logger.child({ namespace: ['workers', 'block'], fn: 'onMessage' })
const onMessage = (worker: Worker) => (message: Message) => {
  const block: ETHBlock = message.getContent()
  msgLogger.debug({ height: Number(block.number) }, 'Block')

  block.transactions.forEach((txid) => worker.sendMessage(new Message(txid), 'txid'))
  worker.ackMessage(message)
}

const main = async () => {
  const worker = await Worker.init({
    queueName: 'queue.block',
    exchangeName: 'exchange.txid',
  })

  worker.queue?.prefetch(1)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main().catch((err) => {
  logger.error(err)
  process.exit(1)
})
