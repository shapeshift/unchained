import axios from 'axios'
import { NewBlock } from '@shapeshiftoss/blockbook'
import { Worker, Message, ReorgBlock, RPCResponse } from '@shapeshiftoss/common-ingester'
import { BlockDocument, BlockService } from '@shapeshiftoss/common-mongo'
import { logger } from '../logger'
import { BTCBlock, ReorgResult } from '../types'

const NODE_ENV = process.env.NODE_ENV
const RPC_URL = process.env.RPC_URL as string

if (NODE_ENV !== 'test') {
  if (!RPC_URL) throw new Error('RPC_URL env var not set')
}

const REORG_BUFFER = 6

const blocks = new BlockService()

const moduleLogger = logger.child({ namespace: ['workers', 'newBlock'] })

const getBlock = async (hashOrHeight: string | number): Promise<BTCBlock> => {
  let hash
  try {
    if (typeof hashOrHeight === 'number') {
      hash = await getBlockHash(hashOrHeight)
    } else if (typeof hashOrHeight === 'string') {
      hash = hashOrHeight
    }
    const block = await getBlockByHash(hash as string)
    return block as BTCBlock
  } catch (err) {
    throw new Error(`failed to get block ${hashOrHeight}: ${err}`)
  }
}

const getBlockByHash = async (hashOrHeight: string): Promise<BTCBlock> => {
  const { data } = await axios.post<RPCResponse>(RPC_URL, {
    jsonrpc: '1.0',
    id: hashOrHeight,
    method: 'getblock',
    params: [hashOrHeight],
  })
  if (data.error) throw new Error(`failed to get block ${hashOrHeight}: ${data.error.message}`)
  if (!data.result) throw new Error(`failed to get block ${hashOrHeight}`)
  return data.result as BTCBlock
}

const getBlockHash = async (height: number): Promise<string> => {
  const { data } = await axios.post<RPCResponse>(RPC_URL, {
    jsonrpc: '1.0',
    id: height,
    method: 'getblockhash',
    params: [height],
  })

  if (data.error) throw new Error(`failed to get blockhash for block number ${height}: ${data.error.message}`)
  if (!data.result) throw new Error(`failed to get blockhash for block number ${height}`)
  return data.result as string
}

const getHeight = async (): Promise<number> => {
  const { data } = await axios.post<RPCResponse>(RPC_URL, {
    jsonrpc: '1.0',
    id: 'getblockcount',
    method: 'getblockcount',
    params: [],
  })

  if (data.error) throw new Error(`failed to get node height: ${data.error.message}`)
  if (!data.result) throw new Error('failed to get node height')
  return Number(data.result)
}

/**
 * Recursively roll back any orphaned blocks in the db by tracing the nodeBlock parent (previous) hash back until it matches a dbBlock hash and returns the reorgResult which we want to begin the delta sync at.
 */
export const handleReorg = async (
  worker: Worker,
  dbBlock: BlockDocument | undefined,
  nodeBlock: BTCBlock
): Promise<ReorgResult> => {
  if (!dbBlock || nodeBlock.previousblockhash === dbBlock.hash) {
    return {
      dbBlock: {
        hash: nodeBlock.hash,
        height: Number(nodeBlock.height),
        prevHash: nodeBlock.previousblockhash,
      },
      height: Number(nodeBlock.height),
      nodeBlock: nodeBlock,
    }
  }

  // mark block as orphaned in the blocks collection
  await blocks.orphan(dbBlock)

  // send reorg block message to notify of the event
  const reorgBlock: ReorgBlock = { hash: dbBlock.hash, height: dbBlock.height, prevHash: dbBlock.prevHash }
  worker.sendMessage(new Message(reorgBlock), 'reorgBlock')

  moduleLogger.debug({ fn: 'handleReorg', dbBlock }, 'Orphaned block')

  // continue handling reorg to find common ancestor
  return handleReorg(worker, await blocks.getByHash(dbBlock.prevHash), await getBlock(nodeBlock.previousblockhash))
}

const msgLogger = moduleLogger.child({ fn: 'onMessage' })
const onMessage = (newBlockWorker: Worker, reorgWorker: Worker) => async (message: Message) => {
  const newBlock: NewBlock = message.getContent()

  try {
    let dbBlockLatest = await blocks.getLatest()
    msgLogger.debug({ dbBlockLatest }, 'DB block')

    const nodeHeight = await getHeight()
    msgLogger.debug({ nodeHeight }, 'Node height')

    let height = dbBlockLatest ? dbBlockLatest.height + 1 : nodeHeight - REORG_BUFFER
    while (height <= nodeHeight) {
      let nodeBlock = await getBlock(height)
      msgLogger.info({ hash: nodeBlock.hash, height: nodeBlock.height }, 'Node block')

      const result = await handleReorg(reorgWorker, dbBlockLatest, nodeBlock)

      height = result.height
      nodeBlock = result.nodeBlock
      dbBlockLatest = result.dbBlock

      await blocks.save(dbBlockLatest)

      newBlockWorker.sendMessage(new Message(nodeBlock), 'block')

      height++
    }

    newBlockWorker.ackMessage(message, newBlock.hash)
  } catch (err) {
    msgLogger.error(err, 'Error processing new block')
    newBlockWorker.retryMessage(message, newBlock.hash)
  }
}

const main = async () => {
  const newBlockWorker = await Worker.init({
    queueName: 'queue.newBlock',
    exchangeName: 'exchange.block',
  })

  const reorgWorker = await Worker.init({
    exchangeName: 'exchange.coinstack',
  })

  newBlockWorker.queue?.prefetch(1)
  newBlockWorker.queue?.activateConsumer(onMessage(newBlockWorker, reorgWorker), { noAck: false })
}

main().catch((err) => {
  logger.error(err)
  process.exit(1)
})
