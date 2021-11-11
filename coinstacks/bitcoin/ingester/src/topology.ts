import { Connection } from 'amqp-ts'
import { logger } from './logger'

<<<<<<< HEAD
const BROKER_URI = process.env.BROKER_URI as string
=======
const BROKER_URL = process.env.BROKER_URL
>>>>>>> develop

if (!BROKER_URI) throw new Error('BROKER_URI env var not set')

const connection = new Connection(BROKER_URI)
const deadLetterExchange = 'exchange.deadLetter'

const topology: Connection.Topology = {
  exchanges: [
    { name: 'exchange.coinstack', type: 'topic', options: { durable: true } },
    { name: 'exchange.deadLetter', type: 'topic', options: { durable: true } },
    { name: 'exchange.block', type: 'fanout', options: { durable: true } },
    { name: 'exchange.txid', type: 'fanout', options: { durable: true } },
    { name: 'exchange.txid.address', type: 'fanout', options: { durable: true } },
    { name: 'exchange.tx', type: 'fanout', options: { durable: true } },
    { name: 'exchange.tx.client', type: 'topic', options: { durable: true } },
  ],
  queues: [
    { name: 'queue.registry', options: { durable: true, deadLetterExchange } },
    { name: 'queue.newBlock', options: { durable: true, deadLetterExchange } },
    { name: 'queue.reorgBlock', options: { durable: true, deadLetterExchange } },
    { name: 'queue.block', options: { durable: true, deadLetterExchange } },
    { name: 'queue.txid', options: { durable: true, deadLetterExchange } },
    { name: 'queue.txid.address', options: { durable: true, deadLetterExchange } },
    { name: 'queue.tx', options: { durable: true, deadLetterExchange } },
    { name: 'queue.tx.unchained', options: { durable: true } }, // default unchained client queue for development
    { name: 'queue.registry.deadLetter', options: { durable: true } },
    { name: 'queue.newBlock.deadLetter', options: { durable: true } },
    { name: 'queue.block.deadLetter', options: { durable: true } },
    { name: 'queue.txid.deadLetter', options: { durable: true } },
    { name: 'queue.txid.address.deadLetter', options: { durable: true } },
    { name: 'queue.tx.deadLetter', options: { durable: true } },
  ],
  bindings: [
    { source: 'exchange.coinstack', queue: 'queue.registry', pattern: 'registry' },
    { source: 'exchange.coinstack', queue: 'queue.newBlock', pattern: 'newBlock' },
    { source: 'exchange.coinstack', queue: 'queue.reorgBlock', pattern: 'reorgBlock' },
    { source: 'exchange.block', queue: 'queue.block' },
    { source: 'exchange.txid', queue: 'queue.txid' },
    { source: 'exchange.txid.address', queue: 'queue.txid.address' },
    { source: 'exchange.tx', queue: 'queue.tx' },
    { source: 'exchange.tx.client', queue: 'queue.tx.unchained', pattern: 'unchained' },
    { source: deadLetterExchange, queue: 'queue.registry.deadLetter', pattern: 'registry' },
    { source: deadLetterExchange, queue: 'queue.newBlock.deadLetter', pattern: 'newBlock' },
    { source: deadLetterExchange, queue: 'queue.reorgBlock.deadLetter', pattern: 'reorgBlock' },
    { source: deadLetterExchange, queue: 'queue.block.deadLetter', pattern: 'block' },
    { source: deadLetterExchange, queue: 'queue.txid.deadLetter', pattern: 'txid' },
    { source: deadLetterExchange, queue: 'queue.txid.address.deadLetter', pattern: 'txid.address' },
    { source: deadLetterExchange, queue: 'queue.tx.deadLetter', pattern: 'tx' },
  ],
}

connection.declareTopology(topology).then(() => {
  logger.info({ topology, fn: 'declareTopology' }, 'RabbitMQ topology configured')
  connection.close()
  process.exit(0)
})
