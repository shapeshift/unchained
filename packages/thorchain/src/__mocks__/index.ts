/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals'
import { DefaultApiGetActionsRequest } from '../generated/midgard'
import midgardSwapResponses from './midgardSwapResponses'

jest.mock('../generated/midgard', () => ({
  Configuration: jest.fn(),
  DefaultApi: jest.fn().mockImplementation(() => ({
    getActions: (requestParameters: DefaultApiGetActionsRequest) => {
      if (!requestParameters.txid) throw new Error('txid paramter required')
      if (!requestParameters.type) throw new Error('type paramter required')

      if (requestParameters.txid === 'non200') return { data: undefined, status: 400 }

      const data = midgardSwapResponses[requestParameters.type][requestParameters.txid]
      return data
        ? { data, status: 200 }
        : { data, status: 500, statusText: `no mock implemented for: ${JSON.stringify(requestParameters)}` }
    },
  })),
}))

export const { Thorchain } = jest.requireActual('../index') as any
