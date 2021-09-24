import { Worker } from '@shapeshiftoss/common-ingester'
import { syncAddressIfRegistered } from '../workers/tx'
import { blockbookTxHistory, db, tx } from './__mocks__/tx'

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

jest.mock('@shapeshiftoss/common-mongo', () => ({
  RegistryService: jest.fn().mockImplementation(() => ({
    getByAddress: (address: string) => Object.values(db).find((v) => address === v.registration.pubkey), //promise
    updateBlock: jest.fn(),
    updateSyncing: jest.fn(),
  })),
}))

jest.mock('@shapeshiftoss/blockbook', () => ({
  Blockbook: jest.fn().mockImplementation(() => ({
    getAddress: () => blockbookTxHistory,
  })),
}))

describe('txWorker', () => {
  beforeEach(() => {
    sendMessageMock.mockClear()
  })

  describe('syncAddressIfRegistered', () => {
    it('should process tx history if address is registered in the db', async () => {
      const worker = await Worker.init({})
      const address = 'bc1qez4d09qctlfyntfkxl3vgs5unzqpgs29ndyu28'
      // Note: blocks 700972, 700971, 700970 in the db have incorrect hashes in order to trigger a reorg
      //const dbAddress = db[700972]
      //const nodeTxHistory = node[700973]

      // const expected = {
      //   height: 700970,
      //   dbBlock: {
      //     hash: node[700970].hash,
      //     height: Number(node[700970].height),
      //     prevHash: node[700970].previousblockhash,
      //   },
      //   nodeBlock: node[700970],
      // }

      const actual = await syncAddressIfRegistered(worker, tx, address)

      expect(sendMessageMock).toHaveBeenCalledTimes(6) // 3
      //expect(actual).toEqual(expected)
    })
  })
})
