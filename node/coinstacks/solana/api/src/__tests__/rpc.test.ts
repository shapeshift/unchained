import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RPCRequest, RPCResponse } from '../../../../common/api/src/models'
import { RPC_ALLOWED_METHODS, doRpcRequest } from '../rpc'

const request = (method: string, id: string | number = 1): RPCRequest => ({ jsonrpc: '2.0', id, method, params: [] })

const forwarder = () => {
  const calls: Array<RPCRequest> = []
  const forward = async (req: RPCRequest): Promise<RPCResponse> => {
    calls.push(req)
    return { jsonrpc: '2.0', id: req.id, result: 'ok' }
  }
  return { calls, forward }
}

describe('doRpcRequest', () => {
  it('forwards every allowed method unchanged', async () => {
    for (const method of RPC_ALLOWED_METHODS) {
      const { calls, forward } = forwarder()
      const req = request(method, method)
      assert.deepEqual(await doRpcRequest(req, forward), { jsonrpc: '2.0', id: method, result: 'ok' })
      assert.deepEqual(calls, [req])
    }
  })

  it('allows the methods used by known clients', () => {
    assert.deepEqual([...RPC_ALLOWED_METHODS].sort(), [
      'getAccountInfo',
      'getBalance',
      'getLatestBlockhash',
      'getMultipleAccounts',
      'sendTransaction',
      'simulateTransaction',
    ])
  })

  it('rejects methods outside of the allow-list without forwarding', async () => {
    for (const method of ['getProgramAccounts', 'getSignaturesForAddress', 'getBlock', 'requestAirdrop', 'toString']) {
      const { calls, forward } = forwarder()
      assert.deepEqual(await doRpcRequest(request(method, 7), forward), {
        jsonrpc: '2.0',
        id: 7,
        error: { code: -32601, message: 'Method not found' },
      })
      assert.equal(calls.length, 0)
    }
  })

  it('rejects malformed requests without forwarding', async () => {
    const malformed = [
      null,
      'getBalance',
      42,
      {},
      { jsonrpc: '2.0', id: 1 },
      { jsonrpc: '2.0', id: 1, method: ['getBalance'] },
    ]
    for (const body of malformed) {
      const { calls, forward } = forwarder()
      const res = (await doRpcRequest(body as unknown as RPCRequest, forward)) as RPCResponse
      assert.equal(res.error?.code, -32601)
      assert.equal(calls.length, 0)
    }
  })

  it('rejects batches, including batches of allowed methods, without forwarding', async () => {
    const { calls, forward } = forwarder()
    const res = await doRpcRequest([request('getBalance', 1), request('getProgramAccounts', 'b')], forward)
    assert.deepEqual(res, [
      { jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Batch requests are not supported' } },
      { jsonrpc: '2.0', id: 'b', error: { code: -32600, message: 'Batch requests are not supported' } },
    ])
    assert.equal(calls.length, 0)
  })

  it('answers an empty batch with a single invalid request error', async () => {
    const { calls, forward } = forwarder()
    assert.deepEqual(await doRpcRequest([], forward), {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Batch requests are not supported' },
    })
    assert.equal(calls.length, 0)
  })

  it('propagates forwarding errors', async () => {
    const forward = async (): Promise<RPCResponse> => {
      throw new Error('upstream failed')
    }
    await assert.rejects(doRpcRequest(request('getBalance'), forward), /upstream failed/)
  })
})
