/**
 * Final production-closure fixtures.
 *
 * The two contracts that the BUG-23..31 matrix did not pin with their required
 * names: a large PostgREST `in.(...)` set must stay chunked, and switching the
 * active workspace must change the visible lead set with no stale cache.
 */
import { describe, expect, it } from 'vitest'
import { chunkedIn } from '@/lib/supabase/chunked-in'
import { scopeLeadsToWorkspace } from '@/lib/leads/board-rows'

const ANEEB = { id: 'ident-aneeb', identityName: 'Aneeb', title: null, channel: 'linkedin', profileId: 'prof-aneeb' }
const MEHAK = { id: 'ident-mehak', identityName: 'Mehak', title: null, channel: 'upwork', profileId: 'prof-mehak' }

function lead(id: string, workspace: string | null, sender: string | null = null) {
  return { id, revenueIdentityId: workspace, senderProfileId: sender }
}

describe('POSTGREST_CHUNKING_LARGE_SET', () => {
  it.each([100, 500, 1000])('chunks %i ids and returns every one, in order', async (count) => {
    const ids = Array.from({ length: count }, (_, i) => `id-${i}`)
    const sizes: number[] = []
    const rows = await chunkedIn<{ id: string }>(ids, async (chunk) => {
      sizes.push(chunk.length)
      return { data: chunk.map((id) => ({ id })), error: null }
    })

    expect(rows).toHaveLength(count)
    expect(rows[0].id).toBe('id-0')
    expect(rows[count - 1].id).toBe(`id-${count - 1}`)
    // No chunk may exceed the 100-id URL budget, and none may be dropped.
    expect(Math.max(...sizes)).toBeLessThanOrEqual(100)
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(count)
  })

  it('never silently returns zero rows when a chunk errors', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`)
    await expect(
      chunkedIn<{ id: string }>(ids, async () => ({ data: null, error: new Error('proxy 414') })),
    ).rejects.toThrow('proxy 414')
  })
})

describe('PROFILE_SWITCH_CACHE_ISOLATION', () => {
  const book = [
    lead('A1', 'ident-aneeb'),
    lead('A2', 'ident-aneeb'),
    lead('B1', 'ident-mehak'),
    lead('L1', null, 'prof-aneeb'),
  ]

  it('shows only the selected workspace’s leads', () => {
    const aneeb = scopeLeadsToWorkspace(book, ANEEB, false)
    const mehak = scopeLeadsToWorkspace(book, MEHAK, false)

    expect(aneeb.map((l) => l.id).sort()).toEqual(['A1', 'A2', 'L1'])
    expect(mehak.map((l) => l.id)).toEqual(['B1'])
  })

  it('Aneeb → Mehak → Aneeb returns the same set each time (no stale cache)', () => {
    const first = scopeLeadsToWorkspace(book, ANEEB, false)
    scopeLeadsToWorkspace(book, MEHAK, false)
    const back = scopeLeadsToWorkspace(book, ANEEB, false)

    expect(back.map((l) => l.id)).toEqual(first.map((l) => l.id))
    expect(back.map((l) => l.id).sort()).toEqual(['A1', 'A2', 'L1'])
  })

  it('keeps the whole book for an admin (org view) and for a rep with no workspace', () => {
    expect(scopeLeadsToWorkspace(book, ANEEB, true)).toHaveLength(4)
    expect(scopeLeadsToWorkspace(book, null, false)).toHaveLength(4)
  })

  it('never leaks a lead across org workspaces', () => {
    const mehak = scopeLeadsToWorkspace(book, MEHAK, false)
    expect(mehak.map((l) => l.id)).not.toContain('A1')
    expect(mehak.map((l) => l.id)).not.toContain('A2')
  })
})
