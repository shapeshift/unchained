import { Connection } from 'amqp-ts'
import { logger } from '@shapeshiftoss/logger'

const BROKER_URL = process.env.BROKER_URL

if (!BROKER_URL) throw new Error('BROKER_URL env var not set')

const connection = new Connection(BROKER_URL)
const deadLetterExchange = 'exchange.ethereum.deadLetter'

const topology: Connection.Topology = {
  exchanges: [
    { name: 'exchange.ethereum', type: 'topic', options: { durable: true } },
    { name: 'exchange.ethereum.deadLetter', type: 'topic', options: { durable: true } },
    { name: 'exchange.ethereum.block', type: 'fanout', options: { durable: true } },
    { name: 'exchange.ethereum.txid', type: 'fanout', options: { durable: true } },
    { name: 'exchange.ethereum.txid.address', type: 'fanout', options: { durable: true } },
    { name: 'exchange.ethereum.tx', type: 'fanout', options: { durable: true } },
    { name: 'exchange.ethereum.tx.client', type: 'topic', options: { durable: true } },
  ],
  queues: [
    { name: 'queue.ethereum.registry', options: { durable: true, deadLetterExchange } },
    { name: 'queue.ethereum.newBlock', options: { durable: true, deadLetterExchange } },
    { name: 'queue.ethereum.reorgBlock', options: { durable: true, deadLetterExchange } },
    { name: 'queue.ethereum.block', options: { durable: true, deadLetterExchange } },
    { name: 'queue.ethereum.txid', options: { durable: true, deadLetterExchange } },
    { name: 'queue.ethereum.txid.address', options: { durable: true, deadLetterExchange } },
    { name: 'queue.ethereum.tx', options: { durable: true, deadLetterExchange } },
    { name: 'queue.ethereum.tx.unchained', options: { durable: true } }, // default unchained client queue for development
    { name: 'queue.ethereum.registry.deadLetter', options: { durable: true } },
    { name: 'queue.ethereum.newBlock.deadLetter', options: { durable: true } },
    { name: 'queue.ethereum.block.deadLetter', options: { durable: true } },
    { name: 'queue.ethereum.txid.deadLetter', options: { durable: true } },
    { name: 'queue.ethereum.txid.address.deadLetter', options: { durable: true } },
    { name: 'queue.ethereum.tx.deadLetter', options: { durable: true } },
  ],
  bindings: [
    { source: 'exchange.ethereum', queue: 'queue.ethereum.registry', pattern: 'registry' },
    { source: 'exchange.ethereum', queue: 'queue.ethereum.newBlock', pattern: 'newBlock' },
    { source: 'exchange.ethereum', queue: 'queue.ethereum.reorgBlock', pattern: 'reorgBlock' },
    { source: 'exchange.ethereum.block', queue: 'queue.ethereum.block' },
    { source: 'exchange.ethereum.txid', queue: 'queue.ethereum.txid' },
    { source: 'exchange.ethereum.txid.address', queue: 'queue.ethereum.txid.address' },
    { source: 'exchange.ethereum.tx', queue: 'queue.ethereum.tx' },
    { source: 'exchange.ethereum.tx.client', queue: 'queue.ethereum.tx.unchained', pattern: 'unchained' },
    { source: deadLetterExchange, queue: 'queue.ethereum.registry.deadLetter', pattern: 'ethereum.registry' },
    { source: deadLetterExchange, queue: 'queue.ethereum.newBlock.deadLetter', pattern: 'newBlock' },
    { source: deadLetterExchange, queue: 'queue.ethereum.reorgBlock.deadLetter', pattern: 'reorgBlock' },
    { source: deadLetterExchange, queue: 'queue.ethereum.block.deadLetter', pattern: 'block' },
    { source: deadLetterExchange, queue: 'queue.ethereum.txid.deadLetter', pattern: 'txid' },
    { source: deadLetterExchange, queue: 'queue.ethereum.txid.address.deadLetter', pattern: 'txid.address' },
    { source: deadLetterExchange, queue: 'queue.ethereum.tx.deadLetter', pattern: 'tx' },
  ],
}

connection.declareTopology(topology).then(() => {
  logger.info('connection.declareTopology:', topology)
  connection.close()
  process.exit(0)
})
