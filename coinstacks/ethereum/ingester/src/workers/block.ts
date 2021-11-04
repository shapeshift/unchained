import { Worker, Message } from '@shapeshiftoss/common-ingester'
import { logger } from '../logger'
import { ETHBlock } from '../types'

const moduleLogger = logger.child({ namespace: ['workers', 'block'] })
const onMessage = (worker: Worker) => (message: Message) => {
  const block: ETHBlock = message.getContent()
  moduleLogger.debug({ block, fn: 'onMessage' }, 'Processing block')

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

main()
