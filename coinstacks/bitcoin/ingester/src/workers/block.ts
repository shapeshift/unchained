import { Worker, Message } from '@shapeshiftoss/common-ingester'
import { logger } from '../logger'
import { BTCBlock } from '../types'

const msgLogger = logger.child({ namespace: ['workers', 'block'], fn: 'onMessage' })
const onMessage = (worker: Worker) => (message: Message) => {
  const block: BTCBlock = message.getContent()
  msgLogger.debug({ height: block.height }, 'Block')

  block.tx.forEach((txid) => worker.sendMessage(new Message(txid), 'txid'))
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
