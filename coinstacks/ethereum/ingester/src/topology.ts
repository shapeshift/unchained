import { Connection } from 'amqp-ts'
import { logger } from '@shapeshiftoss/logger'

const BROKER_URL = process.env.BROKER_URL
const ASSET = process.env.ASSET

if (!BROKER_URL) throw new Error('BROKER_URL env var not set')
if (!ASSET) throw new Error('ASSET env var not set')

const connection = new Connection(BROKER_URL)
const deadLetterExchange = `exchange.${ASSET}.deadLetter`

console.log('ASSET:', ASSET)

const topology: Connection.Topology = {
  exchanges: [
    { name: 'exchange.unchained', type: 'topic', options: { durable: true } },
    { name: `exchange.${ASSET}`, type: 'topic', options: { durable: true } },
    { name: `exchange.${ASSET}.deadLetter`, type: 'topic', options: { durable: true } },
    { name: `exchange.${ASSET}.block`, type: 'fanout', options: { durable: true } },
    { name: `exchange.${ASSET}.txid`, type: 'fanout', options: { durable: true } },
    { name: `exchange.${ASSET}.txid.address`, type: 'fanout', options: { durable: true } },
    { name: `exchange.${ASSET}.tx`, type: 'fanout', options: { durable: true } },
    { name: `exchange.${ASSET}.tx.client`, type: 'topic', options: { durable: true } },
  ],
  queues: [
    { name: `queue.${ASSET}.registry`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${ASSET}.newBlock`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${ASSET}.reorgBlock`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${ASSET}.block`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${ASSET}.txid`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${ASSET}.txid.address`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${ASSET}.tx`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${ASSET}.tx.unchained`, options: { durable: true } }, // default unchained client queue for development
    { name: `queue.${ASSET}.registry.deadLetter`, options: { durable: true } },
    { name: `queue.${ASSET}.newBlock.deadLetter`, options: { durable: true } },
    { name: `queue.${ASSET}.block.deadLetter`, options: { durable: true } },
    { name: `queue.${ASSET}.txid.deadLetter`, options: { durable: true } },
    { name: `queue.${ASSET}.txid.address.deadLetter`, options: { durable: true } },
    { name: `queue.${ASSET}.tx.deadLetter`, options: { durable: true } },
  ],
  bindings: [
    { source: 'exchange.unchained', queue: `queue.${ASSET}.registry`, pattern: `${ASSET}.registry` },
    { source: `exchange.${ASSET}`, queue: `queue.${ASSET}.newBlock`, pattern: 'newBlock' },
    { source: `exchange.${ASSET}`, queue: `queue.${ASSET}.reorgBlock`, pattern: 'reorgBlock' },
    { source: `exchange.${ASSET}.block`, queue: `queue.${ASSET}.block` },
    { source: `exchange.${ASSET}.txid`, queue: `queue.${ASSET}.txid` },
    { source: `exchange.${ASSET}.txid.address`, queue: `queue.${ASSET}.txid.address` },
    { source: `exchange.${ASSET}.tx`, queue: `queue.${ASSET}.tx` },
    { source: `exchange.${ASSET}.tx.client`, queue: `queue.${ASSET}.tx.unchained`, pattern: 'unchained' },
    { source: deadLetterExchange, queue: `queue.${ASSET}.registry.deadLetter`, pattern: `${ASSET}.registry` },
    { source: deadLetterExchange, queue: `queue.${ASSET}.newBlock.deadLetter`, pattern: 'newBlock' },
    { source: deadLetterExchange, queue: `queue.${ASSET}.reorgBlock.deadLetter`, pattern: 'reorgBlock' },
    { source: deadLetterExchange, queue: `queue.${ASSET}.block.deadLetter`, pattern: 'block' },
    { source: deadLetterExchange, queue: `queue.${ASSET}.txid.deadLetter`, pattern: 'txid' },
    { source: deadLetterExchange, queue: `queue.${ASSET}.txid.address.deadLetter`, pattern: 'txid.address' },
    { source: deadLetterExchange, queue: `queue.${ASSET}.tx.deadLetter`, pattern: 'tx' },
  ],
}

connection.declareTopology(topology).then(() => {
  logger.info('connection.declareTopology:', topology)
  connection.close()
  process.exit(0)
})
