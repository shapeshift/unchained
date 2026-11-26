import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { params, toUpstreamRequest } from '../upstream'

const routes = [
  { path: /^coins\/markets$/, params: params('vs_currency', 'ids', 'page') },
  { path: /^coins\/[^/]+$/, params: params() },
  { path: /^v2\/portal$/, params: 'all' as const },
]

const prefix = '/api/v1/test'
const match = (url: string) => toUpstreamRequest(`${prefix}/${url}`, prefix, routes)

describe('toUpstreamRequest', () => {
  it('rejects paths outside the allow-list', () => {
    for (const url of ['key', 'coins/markets/extra', 'coins', '', 'v2/portal/estimate', 'onchain/networks']) {
      assert.equal(match(url), undefined, url)
    }
  })

  it('rejects requests outside the prefix', () => {
    assert.equal(toUpstreamRequest('/api/v1/other/coins/markets', prefix, routes), undefined)
    assert.equal(toUpstreamRequest('/api/v1/testcoins/markets', prefix, routes), undefined)
  })

  it('rejects dot segments, empty segments and encoded separators', () => {
    for (const url of [
      'coins/..',
      'coins/.',
      'coins/%2e%2e',
      'coins/a%2Fb',
      'coins/a%5Cb',
      'coins//markets',
      'coins/%zz',
    ]) {
      assert.equal(match(url), undefined, url)
    }
  })

  it('strips trailing slashes', () => {
    assert.equal(match('coins/markets/')?.url, 'coins/markets')
  })

  it('drops params not on the allow-list', () => {
    assert.equal(match('coins/markets?vs_currency=usd&cachebust=1&x')?.url, 'coins/markets?vs_currency=usd')
    assert.equal(match('coins/bitcoin?foo=bar')?.url, 'coins/bitcoin')
  })

  it('sorts params and drops exact duplicates so equivalent requests share a key', () => {
    const a = match('coins/markets?vs_currency=usd&page=2&ids=a,b')
    const b = match('coins/markets?ids=a,b&vs_currency=usd&page=2&page=2')
    assert.equal(a?.url, 'coins/markets?ids=a,b&page=2&vs_currency=usd')
    assert.equal(a?.url, b?.url)
  })

  it('keeps raw encoding and the order of repeated params', () => {
    assert.equal(
      match('v2/portal?networks=b&networks=a&networks%5B%5D=c&q=%20x')?.url,
      'v2/portal?networks=b&networks=a&networks%5B%5D=c&q=%20x'
    )
  })

  it('forwards every param when the route allows all', () => {
    assert.equal(match('v2/portal?b=2&a=1')?.url, 'v2/portal?a=1&b=2')
  })

  it('returns the matched route', () => {
    assert.equal(match('v2/portal')?.route, routes[2])
  })
})
