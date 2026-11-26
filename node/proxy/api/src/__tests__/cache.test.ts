import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ResponseCache } from '../cache'

const response = (bytes: number) => ({ status: 200, headers: {}, data: Buffer.alloc(bytes) })

describe('ResponseCache', () => {
  it('evicts least recently used entries to stay within the byte budget', () => {
    const cache = new ResponseCache({ maxBytes: 10_000, maxEntryBytes: 5_000 })
    cache.set('a', response(3_000), 60_000)
    cache.set('b', response(3_000), 60_000)
    cache.get('a')
    cache.set('c', response(3_000), 60_000)

    assert.ok(cache.get('a'))
    assert.equal(cache.get('b'), undefined)
    assert.ok(cache.get('c'))
    assert.ok(cache.bytes <= 10_000)
  })

  it('does not store bodies over the entry limit', () => {
    const cache = new ResponseCache({ maxBytes: 100_000, maxEntryBytes: 5_000 })
    cache.set('big', response(10_000), 60_000)
    assert.equal(cache.get('big'), undefined)
    assert.equal(cache.size, 0)
  })

  it('expires entries after their ttl', async () => {
    const cache = new ResponseCache({ maxBytes: 100_000, maxEntryBytes: 5_000 })
    cache.set('short', response(10), 1)
    cache.set('long', response(10), 60_000)
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(cache.get('short'), undefined)
    assert.ok(cache.get('long'))
  })
})
