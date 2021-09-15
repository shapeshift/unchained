import { Connection } from 'amqp-ts'
import { logger } from '@shapeshiftoss/logger'

const BROKER_URL = process.env.BROKER_URL as string
const COINSTACK = process.env.COINSTACK as string

if (!BROKER_URL) throw new Error('BROKER_URL env var not set')
if (!COINSTACK) throw new Error('COINSTACK env var not set')

const connection = new Connection(BROKER_URL)
const deadLetterExchange = `exchange.${COINSTACK}.deadLetter`

const topology: Connection.Topology = {
  exchanges: [
    { name: 'exchange.unchained', type: 'topic', options: { durable: true } },
    { name: `exchange.${COINSTACK}`, type: 'topic', options: { durable: true } },
    { name: `exchange.${COINSTACK}.deadLetter`, type: 'topic', options: { durable: true } },
    { name: `exchange.${COINSTACK}.block`, type: 'fanout', options: { durable: true } },
    { name: `exchange.${COINSTACK}.txid`, type: 'fanout', options: { durable: true } },
    { name: `exchange.${COINSTACK}.txid.address`, type: 'fanout', options: { durable: true } },
    { name: `exchange.${COINSTACK}.tx`, type: 'fanout', options: { durable: true } },
    { name: `exchange.${COINSTACK}.tx.client`, type: 'topic', options: { durable: true } },
  ],
  queues: [
    { name: `queue.${COINSTACK}.registry`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${COINSTACK}.newBlock`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${COINSTACK}.reorgBlock`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${COINSTACK}.block`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${COINSTACK}.txid`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${COINSTACK}.txid.address`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${COINSTACK}.tx`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${COINSTACK}.tx.unchained`, options: { durable: true } }, // default unchained client queue for development
    { name: `queue.${COINSTACK}.registry.deadLetter`, options: { durable: true } },
    { name: `queue.${COINSTACK}.newBlock.deadLetter`, options: { durable: true } },
    { name: `queue.${COINSTACK}.block.deadLetter`, options: { durable: true } },
    { name: `queue.${COINSTACK}.txid.deadLetter`, options: { durable: true } },
    { name: `queue.${COINSTACK}.txid.address.deadLetter`, options: { durable: true } },
    { name: `queue.${COINSTACK}.tx.deadLetter`, options: { durable: true } },
  ],
  bindings: [
    { source: 'exchange.unchained', queue: `queue.${COINSTACK}.registry`, pattern: '${COINSTACK}`.registry' },
    { source: `exchange.${COINSTACK}`, queue: `queue.${COINSTACK}.newBlock`, pattern: 'newBlock' },
    { source: `exchange.${COINSTACK}`, queue: `queue.${COINSTACK}.reorgBlock`, pattern: 'reorgBlock' },
    { source: `exchange.${COINSTACK}.block`, queue: `queue.${COINSTACK}.block` },
    { source: `exchange.${COINSTACK}.txid`, queue: `queue.${COINSTACK}.txid` },
    { source: `exchange.${COINSTACK}.txid.address`, queue: `queue.${COINSTACK}.txid.address` },
    { source: `exchange.${COINSTACK}.tx`, queue: `queue.${COINSTACK}.tx` },
    { source: `exchange.${COINSTACK}.tx.client`, queue: `queue.${COINSTACK}.tx.unchained`, pattern: 'unchained' },
    { source: deadLetterExchange, queue: `queue.${COINSTACK}.registry.deadLetter`, pattern: '${COINSTACK}`.registry' },
    { source: deadLetterExchange, queue: `queue.${COINSTACK}.newBlock.deadLetter`, pattern: 'newBlock' },
    { source: deadLetterExchange, queue: `queue.${COINSTACK}.reorgBlock.deadLetter`, pattern: 'reorgBlock' },
    { source: deadLetterExchange, queue: `queue.${COINSTACK}.block.deadLetter`, pattern: 'block' },
    { source: deadLetterExchange, queue: `queue.${COINSTACK}.txid.deadLetter`, pattern: 'txid' },
    { source: deadLetterExchange, queue: `queue.${COINSTACK}.txid.address.deadLetter`, pattern: 'txid.address' },
    { source: deadLetterExchange, queue: `queue.${COINSTACK}.tx.deadLetter`, pattern: 'tx' },
  ],
}

connection.declareTopology(topology).then(() => {
  logger.info('connection.declareTopology:', topology)
  connection.close()
  process.exit(0)
})
