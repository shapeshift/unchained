import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isRelayedHeader } from '../utils'

describe('isRelayedHeader', () => {
  it('drops upstream account, quota and rate limit headers', () => {
    for (const header of [
      'X-RateLimit-Limit',
      'x-ratelimit-remaining',
      'RateLimit-Reset',
      'ratelimit-policy',
      'x-rate-limit-remaining',
      'x-cg-pro-api-key',
      'x-api-key-usage',
      'x-plan-name',
      'x-credits-remaining',
      'x-quota-remaining',
    ]) {
      assert.equal(isRelayedHeader(header), false, header)
    }
  })

  it('keeps content headers', () => {
    for (const header of ['content-type', 'cache-control', 'etag', 'content-encoding', 'last-modified']) {
      assert.equal(isRelayedHeader(header), true, header)
    }
  })

  it('still drops framing, cookie and cors headers', () => {
    for (const header of ['set-cookie', 'content-length', 'access-control-allow-origin', 'x-cache']) {
      assert.equal(isRelayedHeader(header), false, header)
    }
  })
})
