import { RegistryDocument } from '@shapeshiftoss/common-mongo'

// Contains data for managing client registration state
export interface RegistryMessage extends RegistryDocument {
  action: string
}

// Contains data about a detected reorg block (orphan/uncle)
export interface ReorgBlock {
  hash: string
  height: number
  prevHash: string
}

export interface RPCRequest {
  jsonrpc: '2.0'
  id: string
  method: string
  params: [string]
}

export interface RPCResponse {
  jsonrpc: '2.0'
  id: string
  result?: unknown
  error?: Record<string, unknown>
}

// Contains data required to perform an address delta sync
export interface SyncTx {
  address: string
  client_id: string
  txid: string
  sequence: number
  total: number
}
