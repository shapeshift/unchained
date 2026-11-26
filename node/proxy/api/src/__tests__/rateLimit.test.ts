import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Request } from 'express'
import { clientIp, rateLimit } from '../rateLimit'
import { fakeExchange } from './helpers'

const request = (headers: Record<string, string>, remoteAddress = '10.0.0.1') =>
  ({ headers, socket: { remoteAddress } }) as unknown as Request

describe('clientIp', () => {
  it('prefers cloudflare, then the edge header, then the socket', () => {
    assert.equal(clientIp(request({ 'cf-connecting-ip': '1.1.1.1', 'x-real-ip': '2.2.2.2' })), '1.1.1.1')
    assert.equal(clientIp(request({ 'x-real-ip': '2.2.2.2' })), '2.2.2.2')
    assert.equal(clientIp(request({})), '10.0.0.1')
  })
})

describe('rateLimit', () => {
  const run = (limiter: ReturnType<typeof rateLimit>, ip: string) => {
    const { res, out } = fakeExchange('/api/v1/markets/coins/list')
    let passed = false
    limiter(request({ 'x-real-ip': ip }), res, () => (passed = true))
    return { passed, out }
  }

  it('rejects a client over the limit until the window resets', () => {
    let time = 0
    const limiter = rateLimit({ limit: 2, windowMs: 60_000, now: () => time })

    assert.equal(run(limiter, 'a').passed, true)
    assert.equal(run(limiter, 'a').passed, true)

    const blocked = run(limiter, 'a')
    assert.equal(blocked.passed, false)
    assert.equal(blocked.out.statusCode, 429)
    assert.equal(blocked.out.headers['retry-after'], '60')

    // other clients keep their own budget
    assert.equal(run(limiter, 'b').passed, true)

    time = 60_000
    assert.equal(run(limiter, 'a').passed, true)
  })

  it('shares one bucket between untracked clients once the table is full', () => {
    const limiter = rateLimit({ limit: 1, windowMs: 60_000, maxClients: 1, now: () => 0 })
    assert.equal(run(limiter, 'a').passed, true)
    assert.equal(run(limiter, 'b').passed, true)
    assert.equal(run(limiter, 'c').passed, false)
  })
})
