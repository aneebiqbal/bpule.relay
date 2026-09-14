/**
 * Lightweight content-hash cache for expensive stable intelligence.
 *
 * Keyed by input content hash, not by model-chain ordering, so cache survives
 * provider/model configuration changes.
 */

interface CacheEntry<T> {
  value: T
  createdAt: number
  inputHash: string
}

function simpleHash(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return h.toString(36)
}

export class ContentCache<T> {
  private cache = new Map<string, CacheEntry<T>>()
  private maxSize: number
  private ttlMs: number
  private version: string

  constructor(options: { maxSize?: number; ttlMs?: number; version?: string } = {}) {
    this.maxSize = options.maxSize ?? 200
    this.ttlMs = options.ttlMs ?? 60 * 60 * 1000
    this.version = options.version ?? '1'
  }

  private hash(input: string): string {
    return `${this.version}:${simpleHash(input)}`
  }

  get(input: string): T | null {
    const key = this.hash(input)
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key)
      return null
    }
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.value
  }

  set(input: string, value: T): void {
    const key = this.hash(input)
    this.cache.set(key, { value, createdAt: Date.now(), inputHash: key })
    if (this.cache.size > this.maxSize) {
      const first = this.cache.keys().next().value
      if (typeof first === 'string') this.cache.delete(first)
    }
  }

  invalidate(input: string): void {
    const key = this.hash(input)
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}
