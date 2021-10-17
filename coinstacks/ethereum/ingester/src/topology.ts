import { Connection } from 'amqp-ts'
import { logger } from '@shapeshiftoss/logger'

const BROKER_URL = process.env.BROKER_URL
const NETWORK = process.env.NETWORK

if (!BROKER_URL) throw new Error('BROKER_URL env var not set')
if (!NETWORK) throw new Error('NETWORK env var not set')

const asset = NETWORK !== 'mainnet' ? `ethereum-${NETWORK}` : 'ethereum'
const connection = new Connection(BROKER_URL)
const deadLetterExchange = `exchange.${asset}.deadLetter`

const topology: Connection.Topology = {
  exchanges: [
    { name: 'exchange.unchained', type: 'topic', options: { durable: true } },
    { name: `exchange.${asset}`, type: 'topic', options: { durable: true } },
    { name: `exchange.${asset}.deadLetter`, type: 'topic', options: { durable: true } },
    { name: `exchange.${asset}.block`, type: 'fanout', options: { durable: true } },
    { name: `exchange.${asset}.txid`, type: 'fanout', options: { durable: true } },
    { name: `exchange.${asset}.txid.address`, type: 'fanout', options: { durable: true } },
    { name: `exchange.${asset}.tx`, type: 'fanout', options: { durable: true } },
    { name: `exchange.${asset}.tx.client`, type: 'topic', options: { durable: true } },
  ],
  queues: [
    { name: `queue.${asset}.registry`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${asset}.newBlock`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${asset}.reorgBlock`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${asset}.block`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${asset}.txid`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${asset}.txid.address`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${asset}.tx`, options: { durable: true, deadLetterExchange } },
    { name: `queue.${asset}.tx.unchained`, options: { durable: true } }, // default unchained client queue for development
    { name: `queue.${asset}.registry.deadLetter`, options: { durable: true } },
    { name: `queue.${asset}.newBlock.deadLetter`, options: { durable: true } },
    { name: `queue.${asset}.block.deadLetter`, options: { durable: true } },
    { name: `queue.${asset}.txid.deadLetter`, options: { durable: true } },
    { name: `queue.${asset}.txid.address.deadLetter`, options: { durable: true } },
    { name: `queue.${asset}.tx.deadLetter`, options: { durable: true } },
  ],
  bindings: [
    { source: 'exchange.unchained', queue: `queue.${asset}.registry`, pattern: `${asset}.registry` },
    { source: `exchange.${asset}`, queue: `queue.${asset}.newBlock`, pattern: 'newBlock' },
    { source: `exchange.${asset}`, queue: `queue.${asset}.reorgBlock`, pattern: 'reorgBlock' },
    { source: `exchange.${asset}.block`, queue: `queue.${asset}.block` },
    { source: `exchange.${asset}.txid`, queue: `queue.${asset}.txid` },
    { source: `exchange.${asset}.txid.address`, queue: `queue.${asset}.txid.address` },
    { source: `exchange.${asset}.tx`, queue: `queue.${asset}.tx` },
    { source: `exchange.${asset}.tx.client`, queue: `queue.${asset}.tx.unchained`, pattern: 'unchained' },
    { source: deadLetterExchange, queue: `queue.${asset}.registry.deadLetter`, pattern: `${asset}.registry` },
    { source: deadLetterExchange, queue: `queue.${asset}.newBlock.deadLetter`, pattern: 'newBlock' },
    { source: deadLetterExchange, queue: `queue.${asset}.reorgBlock.deadLetter`, pattern: 'reorgBlock' },
    { source: deadLetterExchange, queue: `queue.${asset}.block.deadLetter`, pattern: 'block' },
    { source: deadLetterExchange, queue: `queue.${asset}.txid.deadLetter`, pattern: 'txid' },
    { source: deadLetterExchange, queue: `queue.${asset}.txid.address.deadLetter`, pattern: 'txid.address' },
    { source: deadLetterExchange, queue: `queue.${asset}.tx.deadLetter`, pattern: 'tx' },
  ],
}

connection.declareTopology(topology).then(() => {
  logger.info('connection.declareTopology:', topology)
  connection.close()
  process.exit(0)
})
