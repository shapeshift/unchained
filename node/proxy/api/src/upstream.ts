// Upstream request shaping shared by the proxies that hold a paid api key

export type Route = {
  // matched against the decoded upstream path, without a trailing slash
  path: RegExp
  // query params forwarded upstream; others are dropped so they can't vary the cache key
  params: ReadonlySet<string> | 'all'
}

export type UpstreamRequest<R extends Route = Route> = {
  route: R
  // upstream path without leading slash, e.g. `coins/markets`
  path: string
  // raw query string without `?`, params sorted by name
  query: string
  // path and query combined, used as the upstream url suffix and the cache key
  url: string
}

export const params = (...names: Array<string>): ReadonlySet<string> => new Set(names)

// one path segment of an id, symbol or address: no separators, no dot segments
const isSafeSegment = (raw: string): boolean => {
  if (!/^[A-Za-z0-9._~:%-]+$/.test(raw)) return false

  let segment: string
  try {
    segment = decodeURIComponent(raw)
  } catch {
    return false
  }

  if (segment === '.' || segment === '..') return false
  return !/[/\\?#\s]/.test(segment)
}

const decodeKey = (raw: string): string | undefined => {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '))
  } catch {
    return
  }
}

/**
 * Matches a proxied request against the allowed routes for an upstream.
 * Returns undefined when the path is not allowed. Query params keep their raw encoding,
 * are filtered to the route's allow-list, de-duplicated and sorted so equivalent requests share one cache key.
 */
export const toUpstreamRequest = <R extends Route>(
  reqUrl: string,
  prefix: string,
  routes: ReadonlyArray<R>
): UpstreamRequest<R> | undefined => {
  const queryIndex = reqUrl.indexOf('?')
  const rawPath = queryIndex === -1 ? reqUrl : reqUrl.slice(0, queryIndex)
  const rawQuery = queryIndex === -1 ? '' : reqUrl.slice(queryIndex + 1)

  if (!rawPath.startsWith(`${prefix}/`)) return

  const path = rawPath.slice(prefix.length + 1).replace(/\/+$/, '')
  const segments = path.split('/')
  if (!path || !segments.every(isSafeSegment)) return

  const decodedPath = segments.map((segment) => decodeURIComponent(segment)).join('/')
  const route = routes.find((route) => route.path.test(decodedPath))
  if (!route) return

  const pairs = new Map<string, { key: string; pair: string }>()
  for (const pair of rawQuery.split('&')) {
    if (!pair) continue
    const key = decodeKey(pair.split('=')[0])
    if (key === undefined) continue
    if (route.params !== 'all' && !route.params.has(key)) continue
    pairs.set(pair, { key, pair })
  }

  // stable sort keeps the order of repeated array params
  const query = [...pairs.values()]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ pair }) => pair)
    .join('&')

  return { route, path, query, url: query ? `${path}?${query}` : path }
}
