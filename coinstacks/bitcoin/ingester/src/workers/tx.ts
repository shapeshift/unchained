import { Tx, Vin, Vout } from '@shapeshiftoss/blockbook'
import { Message, Worker } from '@shapeshiftoss/common-ingester'
import { logger } from '@shapeshiftoss/logger'

const getAddresses = (tx: Tx): Array<string> => {
  const addresses: Array<string> = []

  tx.vin.forEach((vin: Vin) => {
    vin.addresses?.forEach((address: string) => address && addresses.push(address))
  })

  tx.vout.forEach((vout: Vout) => {
    vout.addresses?.forEach((address: string) => address && addresses.push(address))
  })

  // remove duplicates
  return [...new Set(addresses)]
}

const onMessage = (worker: Worker) => async (message: Message) => {
  const tx: Tx = message.getContent()

  try {
    worker.ackMessage(message, tx.txid)
  } catch (err) {
    logger.error('onMessage.error:', err.isAxiosError ? err.message : err)
    worker.retryMessage(message, tx.txid)
  }
}

const main = async () => {
  const worker = await Worker.init({
    queueName: `queue.bitcoin.tx`,
    exchangeName: `exchange.bitcoin.txid.address`,
    requeueName: `exchange.bitcoin.tx`,
  })

  worker.queue?.prefetch(100)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()
