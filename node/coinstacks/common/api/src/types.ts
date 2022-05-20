export interface RPCRequest {
  jsonrpc: '2.0'
  id: string
  method: string
  params: Array<unknown>
}

export interface RPCResponse {
  jsonrpc: '2.0'
  id: string
  result?: unknown
  error?: Record<string, unknown>
}
