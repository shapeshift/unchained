import './env'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Portals, ROUTES } from '../portals'
import { toUpstreamRequest } from '../upstream'
import { fakeExchange, fakeUpstream, logger, withUpstream } from './helpers'

const portals = (path: string) => `/api/v1/portals/${path}`
const match = (path: string) => toUpstreamRequest(portals(path), '/api/v1/portals', ROUTES)

describe('portals routes', () => {
  it('allows the endpoints clients call, keeping their params', () => {
    for (const path of [
      // web lib/portals and market service
      'v2/tokens?limit=250&minLiquidity=100000&networks=ethereum&networks=base&page=0&sortBy=volumeUsd7d&sortDirection=desc&tags=x',
      'v2/tokens?platforms=uniswapv2&networks=ethereum&minLiquidity=100000&limit=250',
      'v2/tokens/history?id=ethereum%3A0xabc&from=1700000000&resolution=1d&page=0',
      'v2/tokens/history?id=ethereum%3A0xabc&from=1700000000&to=1700086400&resolution=1h',
      'v2/platforms',
      // web lib/portals balances (default axios array serializer)
      'v2/account?networks%5B%5D=ethereum&owner=0xabc',
      // swapper, via web and swap-service
      'v2/portal?sender=0xabc&inputToken=ethereum%3A0x1&inputAmount=1&outputToken=ethereum%3A0x2&slippageTolerancePercentage=0.5&validate=false&partner=0xdef&feePercentage=0.1',
      'v2/portal/estimate?inputToken=ethereum%3A0x1&inputAmount=1&outputToken=ethereum%3A0x2&slippageTolerancePercentage=0.5',
    ]) {
      const request = match(path)
      assert.ok(request, path)
      const expected = (path.split('?')[1] ?? '').split('&').filter(Boolean).sort()
      assert.deepEqual(request.query.split('&').filter(Boolean).sort(), expected, path)
    }
  })

  it('rejects other portals endpoints', () => {
    for (const path of ['v2/approval', 'v2/bridges', 'v1/tokens', 'v2/tokens/../account', 'v2/portal/x']) {
      assert.equal(match(path), undefined, path)
    }
  })
})

describe('portals handler', () => {
  it('returns 404 for disallowed paths without calling upstream', async () => {
    const proxy = new Portals(logger)
    const upstream = fakeUpstream()
    withUpstream(proxy, upstream)

    const { req, res, out } = fakeExchange(portals('v2/approval?sender=0x1'))
    await proxy.handler(req, res)

    assert.equal(out.statusCode, 404)
    assert.equal(upstream.calls.length, 0)
  })

  it('caches cached endpoints by the normalized url', async () => {
    const proxy = new Portals(logger)
    const upstream = fakeUpstream()
    withUpstream(proxy, upstream)

    for (const query of ['limit=10&bust=1', 'bust=2&limit=10']) {
      const { req, res } = fakeExchange(portals(`v2/tokens?${query}`))
      await proxy.handler(req, res)
    }

    assert.deepEqual(upstream.calls, ['https://api.portals.fi/v2/tokens?limit=10'])
  })

  it('rejects requests once the limiter queue is full', async () => {
    const proxy = new Portals(logger)
    const release: Array<() => void> = []
    let calls = 0
    withUpstream(proxy, {
      calls: [],
      get: () => {
        calls++
        return new Promise((resolve) =>
          release.push(() => resolve({ status: 200, headers: {}, data: Buffer.from('{}') }))
        )
      },
    })

    // well past 50 in flight plus 500 queued
    const pending = Array.from({ length: 700 }, () => {
      const { req, res, out } = fakeExchange(portals('v2/portal/estimate?inputAmount=1'))
      return { done: proxy.handler(req, res), out }
    })

    // queued jobs start as in-flight ones finish, so keep releasing until every handler settles
    let settled = false
    const all = Promise.all(pending.map(({ done }) => done)).then(() => (settled = true))
    while (!settled) {
      release.splice(0).forEach((fn) => fn())
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    await all

    const ok = pending.filter(({ out }) => out.statusCode === 200).length
    const rejected = pending.filter(({ out }) => out.statusCode === 503)

    assert.ok(rejected.length > 0)
    assert.ok(ok >= 500, `${ok} accepted`)
    assert.equal(ok + rejected.length, pending.length)
    assert.equal(calls, ok)
    assert.equal(rejected[0].out.headers['retry-after'], '5')
  })
})
