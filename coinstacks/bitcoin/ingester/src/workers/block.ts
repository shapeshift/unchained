import { Worker, Message } from '@shapeshiftoss/common-ingester'
import { logger } from '@shapeshiftoss/logger'
import { BTCBlock } from '../types'

const onMessage = (worker: Worker) => (message: Message) => {
  const block: BTCBlock = message.getContent()
  logger.debug(`block: (${Number(block.height)}) ${block.hash}`)

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
