import axios from 'axios'
import { NewBlock } from '@shapeshiftoss/blockbook'
import { Worker, Message, ReorgBlock, RPCResponse } from '@shapeshiftoss/common-ingester'
import { BlockDocument, BlockService } from '@shapeshiftoss/common-mongo'
import { logger } from '@shapeshiftoss/logger'
import { BTCBlock, ReorgResult } from '../types'

const NODE_ENV = process.env.NODE_ENV
const RPC_URL = process.env.RPC_URL as string
const COINSTACK = process.env.COINSTACK

if (NODE_ENV !== 'test') {
  if (!RPC_URL) throw new Error('RPC_URL env var not set')
}

if (!COINSTACK) throw new Error('COINSTACK env var not set')

const REORG_BUFFER = 1

const blocks = new BlockService()

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

const processBlock = async (newBlockWorker: Worker, reorgWorker: Worker): Promise<boolean> => {
  let dbBlockLatest = await blocks.getLatest()
  logger.debug('dbBlockLatest:', dbBlockLatest?.height)

  const nodeHeight = await getHeight()
  logger.debug('nodeHeight:', nodeHeight)

  let height = dbBlockLatest ? dbBlockLatest.height + 1 : nodeHeight - REORG_BUFFER
  while (height <= nodeHeight) {
    const hash = await getBlockHash(height)
    let nodeBlock = await getBlockByHash(hash)
    logger.info(`getBlock: (${Number(nodeBlock.height)}) ${nodeBlock.hash}`)

    const result = await handleReorg(reorgWorker, dbBlockLatest, nodeBlock)

    height = result.height
    nodeBlock = result.nodeBlock
    dbBlockLatest = result.dbBlock

    await blocks.save(dbBlockLatest)

    newBlockWorker.sendMessage(new Message(nodeBlock), 'block')

    height++
  }
  return true
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

  logger.debug(`marking block as orphaned: (${dbBlock.height}) ${dbBlock.hash}`)

  // continue handling reorg to find common ancestor
  return handleReorg(
    worker,
    await blocks.getByHash(dbBlock.prevHash),
    await getBlockByHash(nodeBlock.previousblockhash)
  )
}

const onMessage = (newBlockWorker: Worker, reorgWorker: Worker) => async (message: Message) => {
  const newBlock: NewBlock = message.getContent()

  try {
    await processBlock(newBlockWorker, reorgWorker)
    newBlockWorker.ackMessage(message, newBlock.hash)
  } catch (err) {
    logger.error('onMessage.error:', err.isAxiosError ? err.message : err)
    newBlockWorker.retryMessage(message, newBlock.hash)
  }
}

const main = async () => {
  const newBlockWorker = await Worker.init({
    queueName: `queue.${COINSTACK}.newBlock`,
    exchangeName: `exchange.${COINSTACK}.block`,
  })

  const reorgWorker = await Worker.init({
    exchangeName: `exchange.${COINSTACK}`,
  })

  // prime the pump
  await processBlock(newBlockWorker, reorgWorker)

  newBlockWorker.queue?.prefetch(1)
  newBlockWorker.queue?.activateConsumer(onMessage(newBlockWorker, reorgWorker), { noAck: false })
}

main()
