import { Connection } from 'amqp-ts'
import { logger } from '@shapeshiftoss/logger'

const BROKER_URL = process.env.BROKER_URL as string
const COINSTACK = process.env.COINSTACK as string

if (!BROKER_URL) throw new Error('BROKER_URL env var not set')
if (!COINSTACK) throw new Error('COINSTACK env var not set')

const connection = new Connection(BROKER_URL)
const deadLetterExchange = `exchange.bitcoin.deadLetter`

const topology: Connection.Topology = {
  exchanges: [
    { name: 'exchange.unchained', type: 'topic', options: { durable: true } },
    { name: `exchange.bitcoin`, type: 'topic', options: { durable: true } },
    { name: `exchange.bitcoin.deadLetter`, type: 'topic', options: { durable: true } },
    { name: `exchange.bitcoin.block`, type: 'fanout', options: { durable: true } },
    { name: `exchange.bitcoin.txid`, type: 'fanout', options: { durable: true } },
    { name: `exchange.bitcoin.txid.address`, type: 'fanout', options: { durable: true } },
    { name: `exchange.bitcoin.tx`, type: 'fanout', options: { durable: true } },
    { name: `exchange.bitcoin.tx.client`, type: 'topic', options: { durable: true } },
  ],
  queues: [
    { name: `queue.bitcoin.registry`, options: { durable: true, deadLetterExchange } },
    { name: `queue.bitcoin.newBlock`, options: { durable: true, deadLetterExchange } },
    { name: `queue.bitcoin.reorgBlock`, options: { durable: true, deadLetterExchange } },
    { name: `queue.bitcoin.block`, options: { durable: true, deadLetterExchange } },
    { name: `queue.bitcoin.txid`, options: { durable: true, deadLetterExchange } },
    { name: `queue.bitcoin.txid.address`, options: { durable: true, deadLetterExchange } },
    { name: `queue.bitcoin.tx`, options: { durable: true, deadLetterExchange } },
    { name: `queue.bitcoin.tx.unchained`, options: { durable: true } }, // default unchained client queue for development
    { name: `queue.bitcoin.registry.deadLetter`, options: { durable: true } },
    { name: `queue.bitcoin.newBlock.deadLetter`, options: { durable: true } },
    { name: `queue.bitcoin.block.deadLetter`, options: { durable: true } },
    { name: `queue.bitcoin.txid.deadLetter`, options: { durable: true } },
    { name: `queue.bitcoin.txid.address.deadLetter`, options: { durable: true } },
    { name: `queue.bitcoin.tx.deadLetter`, options: { durable: true } },
  ],
  bindings: [
    { source: 'exchange.unchained', queue: `queue.bitcoin.registry`, pattern: 'bitcoin`.registry' },
    { source: `exchange.bitcoin`, queue: `queue.bitcoin.newBlock`, pattern: 'newBlock' },
    { source: `exchange.bitcoin`, queue: `queue.bitcoin.reorgBlock`, pattern: 'reorgBlock' },
    { source: `exchange.bitcoin.block`, queue: `queue.bitcoin.block` },
    { source: `exchange.bitcoin.txid`, queue: `queue.bitcoin.txid` },
    { source: `exchange.bitcoin.txid.address`, queue: `queue.bitcoin.txid.address` },
    { source: `exchange.bitcoin.tx`, queue: `queue.bitcoin.tx` },
    { source: `exchange.bitcoin.tx.client`, queue: `queue.bitcoin.tx.unchained`, pattern: 'unchained' },
    { source: deadLetterExchange, queue: `queue.bitcoin.registry.deadLetter`, pattern: 'bitcoin`.registry' },
    { source: deadLetterExchange, queue: `queue.bitcoin.newBlock.deadLetter`, pattern: 'newBlock' },
    { source: deadLetterExchange, queue: `queue.bitcoin.reorgBlock.deadLetter`, pattern: 'reorgBlock' },
    { source: deadLetterExchange, queue: `queue.bitcoin.block.deadLetter`, pattern: 'block' },
    { source: deadLetterExchange, queue: `queue.bitcoin.txid.deadLetter`, pattern: 'txid' },
    { source: deadLetterExchange, queue: `queue.bitcoin.txid.address.deadLetter`, pattern: 'txid.address' },
    { source: deadLetterExchange, queue: `queue.bitcoin.tx.deadLetter`, pattern: 'tx' },
  ],
}

connection.declareTopology(topology).then(() => {
  logger.info('connection.declareTopology:', topology)
  connection.close()
  process.exit(0)
})
