import { Blockbook } from '@shapeshiftoss/blockbook'
import { Get, Response } from 'tsoa'
import { BadRequestError, BaseAPI, InternalServerError, utxo } from '../../../common/api'
import { Service } from '../../../common/api/src/utxo/service'
import { UTXO } from '../../../common/api/src/utxo/controller'
import { Logger } from '@shapeshiftoss/logger'

const INDEXER_URL = process.env.INDEXER_URL
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const INDEXER_API_KEY = process.env.INDEXER_API_KEY
const RPC_URL = process.env.RPC_URL
const RPC_API_KEY = process.env.RPC_API_KEY

if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')
if (!INDEXER_API_KEY) throw new Error('INDEXER_API_KEY env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')
if (!RPC_API_KEY) throw new Error('RPC_API_KEY env var not set')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'zcash', 'api'],
  level: process.env.LOG_LEVEL,
})

const httpURL = `${INDEXER_URL}/api=${INDEXER_API_KEY}`
const wsURL = `${INDEXER_WS_URL}/api=${INDEXER_API_KEY}`
const rpcUrl = `${RPC_URL}/api=${RPC_API_KEY}`

const blockbook = new Blockbook({ httpURL, wsURL, logger })

const isXpub = (pubkey: string): boolean => {
  return pubkey.startsWith('xpub')
}

export const formatAddress = (address: string): string => address

export const service = new Service({
  blockbook,
  rpcUrl,
  isXpub,
  addressFormatter: formatAddress,
})

// assign service to be used for all instances of UTXO
UTXO.service = service

export class Zcash extends UTXO implements BaseAPI, utxo.API {
  /**
   * Get current recommended network fees to use in a transaction
   *
   * @returns {Promise<NetworkFees>} current network fees
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Get('/fees')
  async getNetworkFees(): Promise<utxo.NetworkFees> {
    return {
      fast: { blocksUntilConfirmation: 2, satsPerKiloByte: 0 },
      average: { blocksUntilConfirmation: 5, satsPerKiloByte: 0 },
      slow: { blocksUntilConfirmation: 10, satsPerKiloByte: 0 },
    }
  }
}
