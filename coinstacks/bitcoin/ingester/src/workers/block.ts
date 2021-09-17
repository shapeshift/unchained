import { Worker, Message } from '@shapeshiftoss/common-ingester'
import { logger } from '@shapeshiftoss/logger'
import { BTCBlock } from '../types'

const COINSTACK = process.env.COINSTACK
if (!COINSTACK) throw new Error('COINSTACK env var not set')

const onMessage = (worker: Worker) => (message: Message) => {
  const block: BTCBlock = message.getContent()
  logger.debug(`block: (${Number(block.height)}) ${block.hash}`)

  // todo - just 10 for now
  //block.tx.forEach((txid) => worker.sendMessage(new Message(txid), 'txid'))
  const txids = block.tx.slice(10)
  txids.forEach((txid) => worker.sendMessage(new Message(txid), 'txid'))
  // end todo

  worker.ackMessage(message)
}

const main = async () => {
  const worker = await Worker.init({
    queueName: `queue.bitcoin.block`,
    exchangeName: `exchange.bitcoin.txid`,
  })

  worker.queue?.prefetch(1)
  logger.info('block.worker.queue.activateConsumer()')
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()
