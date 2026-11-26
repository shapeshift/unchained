import type { RPCRequest, RPCResponse } from '../../../common/api/src/models'

// json-rpc methods sent by known clients through the jsonrpc passthrough (@solana/web3.js Connection method names map
// to these). add methods here only when a client needs them.
export const RPC_ALLOWED_METHODS = new Set([
  'getAccountInfo', // getAccountInfo, getParsedAccountInfo, getAddressLookupTable, spl-token getAccount
  'getBalance',
  'getLatestBlockhash',
  'getMultipleAccounts', // getMultipleAccountsInfo
  'sendTransaction', // sendRawTransaction
  'simulateTransaction',
])

export const RPC_TIMEOUT = 5_000

const isRpcRequest = (request: unknown): request is RPCRequest =>
  typeof request === 'object' && request !== null && !Array.isArray(request)

const rpcId = (request: unknown): RPCRequest['id'] =>
  isRpcRequest(request) && (typeof request.id === 'string' || typeof request.id === 'number')
    ? request.id
    : (null as unknown as RPCRequest['id'])

export const isRpcAllowed = (request: unknown): request is RPCRequest =>
  isRpcRequest(request) && typeof request.method === 'string' && RPC_ALLOWED_METHODS.has(request.method)

export const rpcMethodNotFound = (request: unknown): RPCResponse => ({
  jsonrpc: '2.0',
  id: rpcId(request),
  error: { code: -32601, message: 'Method not found' },
})

export const rpcBatchNotSupported = (request: unknown): RPCResponse => ({
  jsonrpc: '2.0',
  id: rpcId(request),
  error: { code: -32600, message: 'Batch requests are not supported' },
})

/**
 * Validates a jsonrpc passthrough request before forwarding it to the node.
 * Batches and methods outside of the allow-list are answered locally and never forwarded.
 */
export const doRpcRequest = async (
  req: RPCRequest | Array<RPCRequest>,
  forward: (req: RPCRequest) => Promise<RPCResponse>
): Promise<RPCResponse | Array<RPCResponse>> => {
  // per json-rpc 2.0, an empty batch is answered with a single invalid request error
  if (Array.isArray(req) && req.length === 0) return rpcBatchNotSupported(null)
  if (Array.isArray(req)) return req.map(rpcBatchNotSupported)
  if (!isRpcAllowed(req)) return rpcMethodNotFound(req)
  return forward(req)
}
