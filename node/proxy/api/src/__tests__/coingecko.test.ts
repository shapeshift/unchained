import './env'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CoinGecko, normalize } from '../coingecko'
import { fakeExchange, fakeUpstream, logger, withUpstream } from './helpers'

const markets = (path: string) => `/api/v1/markets/${path}`

// requests made by shapeshift clients through the proxy
const clientRequests = [
  // web caip adapter, asset generation scripts, agentic-chat caip
  'coins/list?include_platform=true',
  // web lib/coingecko
  'coins/list/new',
  'coins/top_gainers_losers?vs_currency=usd',
  'search/trending',
  'coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false',
  'coins/bitcoin',
  // web market service
  'coins/markets?vs_currency=usd&ids=bitcoin,ethereum',
  'coins/ethereum/market_chart/range?vs_currency=usd&from=1700000000&to=1700086400',
  // web asset service
  'coins/ethereum?tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false',
  // web asset generation scripts
  'coins/markets?category=bridged-usdc&vs_currency=usd&per_page=250&page=1',
  // swap-widget
  'coins/markets?vs_currency=usd&per_page=1&page=1',
  // rFOX cli
  'simple/price?vs_currencies=usd&ids=usd-coin',
  // revenue-dashboard, agentic-chat caip
  'coins/ethereum/contract/0xc770eefad204b5180df6a14ee197d99d808ee52d',
  'coins/sui/contract/0x2::sui::SUI',
  'coins/near-protocol/contract/token.near',
]

describe('coingecko normalize', () => {
  it('allows every endpoint clients call, keeping their params', () => {
    for (const path of clientRequests) {
      const normalized = normalize(markets(path))
      assert.ok(normalized, path)

      const [expectedPath, expectedQuery = ''] = path.split('?')
      const [actualPath, actualQuery = ''] = normalized.url.split('?')
      assert.equal(actualPath, expectedPath)
      if (!expectedPath.endsWith('/market_chart/range')) {
        assert.deepEqual(actualQuery.split('&').sort(), expectedQuery.split('&').sort(), path)
      }
    }
  })

  it('rejects account and unlisted endpoints', () => {
    for (const path of [
      'key',
      'ping',
      'coins/categories',
      'coins/bitcoin/tickers',
      'coins/bitcoin/history?date=01-01-2024',
      'onchain/networks',
      'global',
      'exchanges',
      'nfts/list',
      'coins/../key',
      'coins/%2E%2E/key',
    ]) {
      assert.equal(normalize(markets(path)), undefined, path)
    }
  })

  it('ignores unused params and param order in the cache key', () => {
    const a = normalize(markets('coins/markets?vs_currency=usd&page=1&junk=1'))
    const b = normalize(markets('coins/markets?page=1&vs_currency=usd&other=2'))
    assert.equal(a?.url, 'coins/markets?page=1&vs_currency=usd')
    assert.equal(a?.url, b?.url)
  })

  it('still buckets market chart ranges', () => {
    const a = normalize(markets('coins/bitcoin/market_chart/range?vs_currency=usd&from=1700000001&to=1700086401&x=1'))
    const b = normalize(markets('coins/bitcoin/market_chart/range?to=1700086402&from=1700000002&vs_currency=usd'))
    assert.ok(a)
    assert.equal(a.url, b?.url)
    assert.ok(!a.url.includes('x='))
  })
})

describe('coingecko handler', () => {
  it('returns 404 for disallowed paths without calling upstream', async () => {
    const coingecko = new CoinGecko(logger)
    const upstream = fakeUpstream()
    withUpstream(coingecko, upstream)

    const { req, res, out } = fakeExchange(markets('key'))
    await coingecko.handler(req, res)

    assert.equal(out.statusCode, 404)
    assert.equal(upstream.calls.length, 0)
  })

  it('serves junk param variants from one upstream call and strips account headers', async () => {
    const coingecko = new CoinGecko(logger)
    const upstream = fakeUpstream(() => ({
      status: 200,
      headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '10', 'x-cg-plan': 'pro' },
      data: Buffer.from('{"ok":true}'),
    }))
    withUpstream(coingecko, upstream)

    for (let i = 0; i < 3; i++) {
      const { req, res, out } = fakeExchange(markets(`simple/price?ids=bitcoin&vs_currencies=usd&bust=${i}`))
      await coingecko.handler(req, res)
      assert.equal(out.statusCode, 200)
      assert.equal(out.headers['content-type'], 'application/json')
      assert.equal(out.headers['x-ratelimit-remaining'], undefined)
      assert.equal(out.headers['x-cg-plan'], undefined)
      assert.equal(out.headers['x-cache'], i === 0 ? 'MISS' : 'HIT')
    }

    assert.deepEqual(upstream.calls, [
      'https://pro-api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
    ])
  })
})
