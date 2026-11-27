import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { afterEach, describe, it } from 'node:test'
import { Logger } from '@shapeshiftoss/logger'
import { AddressSubscriptionClient, BaseConnectionHandler } from '@shapeshiftoss/websocket'
import WebSocket from 'ws'
import { MAX_ADDRESS_LENGTH, Registry } from '../registry'
import { getAddress } from 'viem'
import { formatAddress as formatEvmAddress } from '../evm'
import { ConnectionHandler } from '../websocket'

const logger = new Logger({ namespace: ['test'], level: 'error' })

const INHERITED_NAMES = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', '__defineGetter__']

/**
 * Minimal stand-in for a ws WebSocket connection. The connection handler assigns onclose/onerror/onmessage
 * and calls ping/pong/send/terminate, so this is all that is needed to drive it without a network.
 */
class FakeWebSocket extends EventEmitter {
  sent: Array<string> = []
  onclose?: (event: { code: number; reason: string }) => void
  onerror?: (event: unknown) => void
  onmessage?: (event: { data: string }) => void

  ping(): void {}
  pong(): void {}
  terminate(): void {}
  send(data: string): void {
    this.sent.push(data)
  }

  message(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }

  close(): void {
    this.onclose?.({ code: 1000, reason: '' })
  }
}

const noopClient: AddressSubscriptionClient = {
  subscribeAddresses: () => undefined,
  unsubscribeAddresses: () => undefined,
}

const transactionHandler = async () => ({ addresses: [], tx: {} })

const connect = (registry: Registry, client: AddressSubscriptionClient = noopClient): FakeWebSocket => {
  const ws = new FakeWebSocket()
  ConnectionHandler.start(ws as unknown as WebSocket, registry, client, logger)
  sockets.push(ws)
  return ws
}

const sockets: Array<FakeWebSocket> = []

afterEach(() => {
  // make sure every handler clears its ping interval / heartbeat timeout
  sockets.splice(0).forEach((ws) => ws.close())
})

describe('Registry', () => {
  for (const name of INHERITED_NAMES) {
    it(`handles subscribe/unsubscribe of inherited property name "${name}"`, () => {
      const registry = new Registry({ addressFormatter: (address) => address, transactionHandler })
      const connection = {} as ConnectionHandler

      assert.doesNotThrow(() => registry.subscribe('client', 'sub', connection, [name]))
      assert.doesNotThrow(() => registry.unsubscribe('client', 'sub', []))
      assert.deepEqual(registry.getAddresses(), [])
    })
  }

  it('tracks and releases normal addresses', () => {
    const registry = new Registry({ transactionHandler })
    const connection = {} as ConnectionHandler

    assert.deepEqual(registry.subscribe('a', '1', connection, ['ABC', 'def']), ['abc', 'def'])
    assert.deepEqual(registry.subscribe('b', '1', connection, ['abc']), [])
    assert.deepEqual(registry.getAddresses().sort(), ['abc', 'def'])

    assert.deepEqual(registry.unsubscribe('a', '1', []), ['def'])
    assert.deepEqual(registry.getAddresses(), ['abc'])
    assert.deepEqual(registry.unsubscribe('b', '1', ['abc']), ['abc'])
    assert.deepEqual(registry.getAddresses(), [])
  })

  it('ignores addresses rejected by the validator or formatter', () => {
    const registry = new Registry({
      addressFormatter: formatEvmAddress,
      addressValidator: (address) => address !== getAddress('0x000000000000000000000000000000000000dead'),
      transactionHandler,
    })
    const connection = {} as ConnectionHandler
    const valid = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'

    const subscribed = registry.subscribe('a', '1', connection, [
      'constructor',
      '0x000000000000000000000000000000000000dead',
      valid,
      1 as unknown as string,
      '',
    ])

    assert.deepEqual(subscribed, [getAddress(valid)])
    assert.deepEqual(registry.getAddresses(), [getAddress(valid)])
    assert.deepEqual(registry.unsubscribe('a', '1', ['constructor', valid]), [getAddress(valid)])
    assert.deepEqual(registry.getAddresses(), [])
  })

  it('rejects oversized addresses before formatting or validating', () => {
    const seen: Array<string> = []
    const registry = new Registry({
      addressFormatter: (address) => {
        seen.push(address)
        return address
      },
      transactionHandler,
    })

    assert.equal(registry.toValidAddress('z'.repeat(MAX_ADDRESS_LENGTH + 1)), undefined)
    assert.deepEqual(seen, [])

    const longest = 'u'.repeat(MAX_ADDRESS_LENGTH)
    assert.equal(registry.toValidAddress(longest), longest)
  })

  it('does not register a client when no addresses are valid', async () => {
    const published: Array<unknown> = []
    const registry = new Registry({
      addressValidator: () => false,
      transactionHandler: async () => {
        published.push('handled')
        return { addresses: [], tx: {} }
      },
    })

    assert.deepEqual(registry.subscribe('a', '1', {} as ConnectionHandler, ['abc']), [])
    await registry.onTransaction({})
    assert.deepEqual(published, [])
  })

  it('publishes transactions to subscribed connections', async () => {
    const addresses = ['abc']
    const published: Array<unknown> = []
    const registry = new Registry({
      transactionHandler: async () => ({ addresses, tx: { txid: '1' } }),
    })
    const connection = {
      publish: (subscriptionId: string, payload: unknown) => published.push({ subscriptionId, payload }),
    } as unknown as ConnectionHandler

    registry.subscribe('a', 'sub', connection, ['ABC'])
    await registry.onTransaction({})

    assert.deepEqual(published, [{ subscriptionId: 'sub', payload: { address: 'abc', data: { txid: '1' } } }])
  })
})

describe('ConnectionHandler', () => {
  for (const name of INHERITED_NAMES) {
    it(`does not throw on close after subscribing to "${name}"`, () => {
      const registry = new Registry({ addressFormatter: (address) => address, transactionHandler })
      const ws = connect(registry)

      ws.message({ subscriptionId: 'sub', method: 'subscribe', data: { topic: 'txs', addresses: [name] } })

      assert.doesNotThrow(() => ws.close())
      assert.deepEqual(registry.getAddresses(), [])
    })
  }

  it('reports invalid addresses and only subscribes valid ones', () => {
    const subscribed: Array<Array<string>> = []
    const client: AddressSubscriptionClient = {
      subscribeAddresses: (_, addresses) => subscribed.push(addresses),
      unsubscribeAddresses: () => undefined,
    }
    const registry = new Registry({ addressValidator: (address) => address.startsWith('ok'), transactionHandler })
    const ws = connect(registry, client)

    ws.message({ subscriptionId: 'a', method: 'subscribe', data: { topic: 'txs', addresses: ['ok1', 'constructor'] } })
    ws.message({ subscriptionId: 'b', method: 'subscribe', data: { topic: 'txs', addresses: ['__proto__'] } })

    assert.deepEqual(subscribed, [['ok1']])
    assert.deepEqual(registry.getAddresses(), ['ok1'])
    assert.deepEqual(
      ws.sent.map((msg) => JSON.parse(msg)),
      [
        { subscriptionId: 'a', type: 'error', message: 'invalid addresses ignored: 1' },
        { subscriptionId: 'b', type: 'error', message: 'invalid addresses ignored: 1' },
      ]
    )

    ws.close()
    assert.deepEqual(registry.getAddresses(), [])
  })
})

describe('BaseConnectionHandler', () => {
  class ThrowingConnectionHandler extends BaseConnectionHandler {
    onSubscribe(subscriptionId: string): void {
      this.subscriptionIds.add(subscriptionId)
    }
    onUnsubscribe(): void {}
    onClose(): void {
      throw new Error('close failed')
    }
    get subscriptions(): number {
      return this.subscriptionIds.size
    }
  }

  it('does not propagate errors thrown by onClose', () => {
    const ws = new FakeWebSocket()
    const handler = new ThrowingConnectionHandler(ws as unknown as WebSocket, logger)
    sockets.push(ws)

    ws.message({ subscriptionId: 'a', method: 'subscribe' })
    assert.equal(handler.subscriptions, 1)

    assert.doesNotThrow(() => ws.close())
    assert.equal(handler.subscriptions, 0)
  })
})
