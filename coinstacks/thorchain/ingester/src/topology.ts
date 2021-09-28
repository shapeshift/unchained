import { Connection } from 'amqp-ts'
import { logger } from '@shapeshiftoss/logger'

const BROKER_URL = process.env.BROKER_URL as string

if (!BROKER_URL) throw new Error('BROKER_URL env var not set')

const connection = new Connection(BROKER_URL)
const deadLetterExchange = 'exchange.thorchain.deadLetter'

const topology: Connection.Topology = {
  exchanges: [
    { name: 'exchange.unchained', type: 'topic', options: { durable: true } },
    { name: 'exchange.thorchain', type: 'topic', options: { durable: true } },
    { name: 'exchange.thorchain.deadLetter', type: 'topic', options: { durable: true } },
    { name: 'exchange.thorchain.block', type: 'fanout', options: { durable: true } },
    { name: 'exchange.thorchain.txid', type: 'fanout', options: { durable: true } },
    { name: 'exchange.thorchain.txid.address', type: 'fanout', options: { durable: true } },
    { name: 'exchange.thorchain.tx', type: 'fanout', options: { durable: true } },
    { name: 'exchange.thorchain.tx.client', type: 'topic', options: { durable: true } },
  ],
  queues: [
    { name: 'queue.thorchain.registry', options: { durable: true, deadLetterExchange } },
    { name: 'queue.thorchain.newBlock', options: { durable: true, deadLetterExchange } },
    { name: 'queue.thorchain.reorgBlock', options: { durable: true, deadLetterExchange } },
    { name: 'queue.thorchain.block', options: { durable: true, deadLetterExchange } },
    { name: 'queue.thorchain.txid', options: { durable: true, deadLetterExchange } },
    { name: 'queue.thorchain.txid.address', options: { durable: true, deadLetterExchange } },
    { name: 'queue.thorchain.tx', options: { durable: true, deadLetterExchange } },
    { name: 'queue.thorchain.tx.unchained', options: { durable: true } }, // default unchained client queue for development
    { name: 'queue.thorchain.registry.deadLetter', options: { durable: true } },
    { name: 'queue.thorchain.newBlock.deadLetter', options: { durable: true } },
    { name: 'queue.thorchain.block.deadLetter', options: { durable: true } },
    { name: 'queue.thorchain.txid.deadLetter', options: { durable: true } },
    { name: 'queue.thorchain.txid.address.deadLetter', options: { durable: true } },
    { name: 'queue.thorchain.tx.deadLetter', options: { durable: true } },
  ],
  bindings: [
    { source: 'exchange.unchained', queue: 'queue.thorchain.registry', pattern: 'thorchain.registry' },
    { source: 'exchange.thorchain', queue: 'queue.thorchain.newBlock', pattern: 'newBlock' },
    { source: 'exchange.thorchain', queue: 'queue.thorchain.reorgBlock', pattern: 'reorgBlock' },
    { source: 'exchange.thorchain.block', queue: 'queue.thorchain.block' },
    { source: 'exchange.thorchain.txid', queue: 'queue.thorchain.txid' },
    { source: 'exchange.thorchain.txid.address', queue: 'queue.thorchain.txid.address' },
    { source: 'exchange.thorchain.tx', queue: 'queue.thorchain.tx' },
    { source: 'exchange.thorchain.tx.client', queue: 'queue.thorchain.tx.unchained', pattern: 'unchained' },
    { source: deadLetterExchange, queue: 'queue.thorchain.registry.deadLetter', pattern: 'thorchain.registry' },
    { source: deadLetterExchange, queue: 'queue.thorchain.newBlock.deadLetter', pattern: 'newBlock' },
    { source: deadLetterExchange, queue: 'queue.thorchain.reorgBlock.deadLetter', pattern: 'reorgBlock' },
    { source: deadLetterExchange, queue: 'queue.thorchain.block.deadLetter', pattern: 'block' },
    { source: deadLetterExchange, queue: 'queue.thorchain.txid.deadLetter', pattern: 'txid' },
    { source: deadLetterExchange, queue: 'queue.thorchain.txid.address.deadLetter', pattern: 'txid.address' },
    { source: deadLetterExchange, queue: 'queue.thorchain.tx.deadLetter', pattern: 'tx' },
  ],
}

connection.declareTopology(topology).then(() => {
  logger.info('connection.declareTopology:', topology)
  connection.close()
  process.exit(0)
})
