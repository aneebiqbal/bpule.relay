/**
 * Neon adapter contract: PostgREST operator names must become SQL operators.
 * `not('status','eq','archived')` must emit `NOT (status = $1)` — the previous
 * `NOT (status EQ $1)` was invalid SQL and silently broke the Upwork sweep.
 */
import { describe, expect, it } from 'vitest'
import { neonDbClient } from '@/lib/db/neon'

function capturingPool() {
  const queries: string[] = []
  const client = {
    query: async (text: string) => { queries.push(text); return { rows: [] } },
    release: () => {},
  }
  return { pool: { connect: async () => client }, queries }
}

describe('Neon query builder operators', () => {
  it("maps not(...,'eq') to a SQL equality", async () => {
    const { pool, queries } = capturingPool()
    const db = neonDbClient('user', pool as never)
    await db.from('upwork_applications').select('id').not('status', 'eq', 'archived')
    expect(queries.some((q) => /NOT \("status" = \$1\)/.test(q))).toBe(true)
  })

  it("maps filter(...,'eq') to a SQL equality", async () => {
    const { pool, queries } = capturingPool()
    const db = neonDbClient('user', pool as never)
    await db.from('upwork_applications').select('id').filter('status', 'eq', 'submitted')
    expect(queries.some((q) => /"status" = \$1/.test(q))).toBe(true)
  })

  it("maps not(...,'neq') to a SQL inequality", async () => {
    const { pool, queries } = capturingPool()
    const db = neonDbClient('user', pool as never)
    await db.from('upwork_jobs').select('id').not('status', 'neq', 'SAVED')
    expect(queries.some((q) => /NOT \("status" <> \$1\)/.test(q))).toBe(true)
  })
})
