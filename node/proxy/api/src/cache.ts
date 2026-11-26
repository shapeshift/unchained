import { AxiosResponse } from 'axios'
import { LRUCache } from 'lru-cache'

export type CachedResponse = Pick<AxiosResponse<Buffer>, 'status' | 'headers' | 'data'>

export type ResponseCacheOptions = {
  // total bytes held by the cache before least recently used entries are evicted
  maxBytes: number
  // responses larger than this are served but never cached
  maxEntryBytes: number
}

// rough allowance for the key, status and headers kept with each body
const ENTRY_OVERHEAD_BYTES = 1024

const sizeOf = (key: string, response: CachedResponse): number =>
  key.length + (Buffer.isBuffer(response.data) ? response.data.length : 0) + ENTRY_OVERHEAD_BYTES

/**
 * Upstream response cache bounded by a byte budget, with a ttl per entry.
 */
export class ResponseCache {
  private cache: LRUCache<string, CachedResponse>

  constructor({ maxBytes, maxEntryBytes }: ResponseCacheOptions) {
    this.cache = new LRUCache<string, CachedResponse>({
      maxSize: maxBytes,
      maxEntrySize: maxEntryBytes,
      ttlAutopurge: false,
    })
  }

  get(key: string): CachedResponse | undefined {
    return this.cache.get(key)
  }

  set(key: string, response: CachedResponse, ttl: number): void {
    // lru-cache skips entries above maxEntrySize, so oversized bodies are never stored
    this.cache.set(key, response, { ttl, size: sizeOf(key, response) })
  }

  get size(): number {
    return this.cache.size
  }

  get bytes(): number {
    return this.cache.calculatedSize
  }
}

export const MB = 1024 * 1024
