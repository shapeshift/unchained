import { Worker } from '@shapeshiftoss/common-ingester'
import { handleReorg } from '../workers/newBlock'
import { db, node } from './mockData/reorg'

const sendMessageMock = jest.fn()
jest.mock('@shapeshiftoss/common-ingester', () => ({
  Worker: {
    init: () => ({
      queue: {
        prefetch: jest.fn(),
        activateConsumer: jest.fn(),
      },
      sendMessage: () => sendMessageMock(),
    }),
  },
  Message: jest.fn(),
}))

jest.mock('axios', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post: (_: string, data: any) => {
    const block = Object.values(node).find((v) => data.params[0] === v.hash)
    return { data: { result: block } }
  },
}))

const orphanMock = jest.fn()
jest.mock('@shapeshiftoss/common-mongo', () => ({
  BlockService: jest.fn().mockImplementation(() => ({
    getByHash: (hash: string) => Object.values(db).find((v) => hash === v.hash),
    orphan: () => orphanMock(),
  })),
}))

describe('newBlockWorker', () => {
  beforeEach(() => {
    orphanMock.mockClear()
    sendMessageMock.mockClear()
  })

  describe('handleReorg', () => {
    it('should handle a reorg if there are orphaned blocks in db', async () => {
      const worker = await Worker.init({})

      // Note: blocks 700972, 700971, 700970 in the db have incorrect hashes in order to trigger a reorg
      const dbLatestBlock = db[700972]
      const nodeBlock = node[700973]

      const expected = {
        height: 700970,
        dbBlock: {
          hash: node[700970].hash,
          height: Number(node[700970].height),
          prevHash: node[700970].previousblockhash,
        },
        nodeBlock: node[700970],
      }

      const actual = await handleReorg(worker, dbLatestBlock, nodeBlock)

      expect(orphanMock).toHaveBeenCalledTimes(3) // 3,
      expect(sendMessageMock).toHaveBeenCalledTimes(3) // 3
      expect(actual).toEqual(expected)
    })

    it('should use node height if no blocks in db', async () => {
      const worker = await Worker.init({})

      const dbLatestBlock = undefined
      const nodeBlock = node[700971]

      const expected = {
        height: 700971,
        dbBlock: {
          hash: node[700971].hash,
          height: Number(node[700971].height),
          prevHash: node[700971].previousblockhash,
        },
        nodeBlock: node[700971],
      }

      const actual = await handleReorg(worker, dbLatestBlock, nodeBlock)

      expect(orphanMock).toHaveBeenCalledTimes(0)
      expect(sendMessageMock).toHaveBeenCalledTimes(0)
      expect(actual).toEqual(expected)
    })

    it('should use node height if no reorg detected', async () => {
      const worker = await Worker.init({})

      const dbLatestBlock = db[700969]
      const nodeBlock = node[700970]

      const expected = {
        height: 700970,
        dbBlock: {
          hash: node[700970].hash,
          height: Number(node[700970].height),
          prevHash: node[700970].previousblockhash,
        },
        nodeBlock: node[700970],
      }

      const actual = await handleReorg(worker, dbLatestBlock, nodeBlock)

      expect(orphanMock).toHaveBeenCalledTimes(0)
      expect(sendMessageMock).toHaveBeenCalledTimes(0)
      expect(actual).toEqual(expected)
    })
  })
})
