import './env'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ROUTES, Zerion } from '../zerion'
import { toUpstreamRequest } from '../upstream'
import { fakeExchange, fakeUpstream, logger, withUpstream } from './helpers'

const zerion = (path: string) => `/api/v1/zerion/${path}`
const match = (path: string) => toUpstreamRequest(zerion(path), '/api/v1/zerion', ROUTES)

describe('zerion routes', () => {
  it('allows the endpoints web calls', () => {
    for (const path of [
      // market service implementation lookup
      'fungibles?filter%5Bfungible_implementations%5D=ethereum%3A0xabc',
      // market service findAll, first page and next links
      'fungibles/?sort=market_data.market_cap&page%5Bsize%5D=100',
      'fungibles/?currency=usd&page%5Bafter%5D=MTAw&page%5Bsize%5D=100&sort=market_data.market_cap',
      // market service price history
      'fungibles/eth/charts/hour',
      'fungibles/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48/charts/max',
    ]) {
      const request = match(path)
      assert.ok(request, path)
      assert.equal(
        request.query.split('&').filter(Boolean).length,
        (path.split('?')[1] ?? '').split('&').filter(Boolean).length,
        path
      )
    }
  })

  it('rejects other zerion endpoints', () => {
    for (const path of [
      'chains',
      'wallets/0xabc/positions',
      'wallets/0xabc/transactions',
      'fungibles/eth',
      'fungibles/eth/charts/decade',
      'nfts',
      'gas-prices',
    ]) {
      assert.equal(match(path), undefined, path)
    }
  })

  it('drops undocumented params', () => {
    assert.equal(match('fungibles/eth/charts/day?currency=usd&bust=1')?.url, 'fungibles/eth/charts/day?currency=usd')
  })
})

describe('zerion handler', () => {
  it('returns 404 for disallowed paths without calling upstream', async () => {
    const proxy = new Zerion(logger)
    const upstream = fakeUpstream()
    withUpstream(proxy, upstream)

    const { req, res, out } = fakeExchange(zerion('chains'))
    await proxy.handler(req, res)

    assert.equal(out.statusCode, 404)
    assert.equal(upstream.calls.length, 0)
  })

  it('caches by the normalized url', async () => {
    const proxy = new Zerion(logger)
    const upstream = fakeUpstream()
    withUpstream(proxy, upstream)

    for (const query of ['currency=usd&bust=1', 'bust=2&currency=usd']) {
      const { req, res } = fakeExchange(zerion(`fungibles/eth/charts/day?${query}`))
      await proxy.handler(req, res)
    }

    assert.deepEqual(upstream.calls, ['https://api.zerion.io/v1/fungibles/eth/charts/day?currency=usd'])
  })
})
