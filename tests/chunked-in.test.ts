/**
 * Large `in.(...)` lists must be chunked. PostgREST puts the list in the URL;
 * a few hundred UUIDs exceed the proxy limit and the request comes back with no
 * rows, which is how an active organisation rendered as an empty heatmap.
 */
import { describe, expect, it, vi } from 'vitest'
import { chunkedIn } from '@/lib/supabase/chunked-in'

describe('chunkedIn', () => {
  it('does not call the runner for an empty list', async () => {
    const run = vi.fn()
    expect(await chunkedIn([], run)).toEqual([])
    expect(run).not.toHaveBeenCalled()
  })

  it('splits 250 ids into 100/100/50 and preserves order', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`)
    const sizes: number[] = []
    const rows = await chunkedIn<{ id: string }>(ids, async (chunk) => {
      sizes.push(chunk.length)
      return { data: chunk.map((id) => ({ id })), error: null }
    })
    expect(sizes).toEqual([100, 100, 50])
    expect(rows).toHaveLength(250)
    expect(rows[0].id).toBe('id-0')
    expect(rows[249].id).toBe('id-249')
  })

  it('concatenates every chunk, not just the first', async () => {
    const rows = await chunkedIn<{ id: string }>(['a', 'b', 'c'], async (chunk) => ({
      data: chunk.map((id) => ({ id })),
      error: null,
    }), 2)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('throws on a chunk error instead of silently returning empty', async () => {
    await expect(chunkedIn(['a'], async () => ({ data: null, error: new Error('boom') }))).rejects.toThrow('boom')
  })

  it('treats a null data payload as no rows', async () => {
    expect(await chunkedIn(['a'], async () => ({ data: null, error: null }))).toEqual([])
  })
})
