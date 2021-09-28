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
      const address = blockbookTxHistory.address
      await syncAddressIfRegistered(worker, tx, address)
      expect(sendMessageMock).toHaveBeenCalledTimes(blockbookTxHistory.txids.length)
    })
  })
})
