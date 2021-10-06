import { Worker, Message } from '@shapeshiftoss/common-ingester'
import { logger } from '@shapeshiftoss/logger'
import { THORBlock } from '../types'

const onMessage = (worker: Worker) => (message: Message) => {
  const block: THORBlock = message.getContent()
  logger.debug(`block: (${Number(block.number)}) ${block.hash}`)

  block.transactions.forEach((txid) => worker.sendMessage(new Message(txid), 'txid'))

  worker.ackMessage(message)
}

const main = async () => {
  const worker = await Worker.init({
    queueName: 'queue.thorchain.block',
    exchangeName: 'exchange.thorchain.txid',
  })

  worker.queue?.prefetch(1)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()
