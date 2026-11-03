import { afterEach, describe, expect, it } from 'vitest'
import { NeonDbClient, NeonExecutorImpl, neonTypeParser, type NeonExecutorApi } from '@/lib/db/neon'
import type { DbResult } from '@/lib/db/neon'
import { resolveDbProvider } from '@/lib/db/types'

/**
 * The Neon adapter is the cutover path, so its SQL generation is asserted
 * directly: the exact statement, the exact parameter order, and which executor
 * method (read vs write transaction) each operation uses.
 *
 * The builder emits `?` placeholders; `NeonExecutorImpl` rewrites them to `$n`
 * and puts the RLS identity in `$1`. Both halves are covered here.
 */

type Call = { method: 'query' | 'queryInWrite'; sql: string; values: unknown[] }

function fakeExecutor(calls: Call[]): NeonExecutorApi {
  return {
    async query(text, values = []) {
      calls.push({ method: 'query', sql: text, values })
      return []
    },
    async queryInWrite(text, values = []) {
      calls.push({ method: 'queryInWrite', sql: text, values })
      return []
    },
  }
}

describe('NEON query builder — select', () => {
  it('builds a filtered, ordered, limited select in one read round trip', async () => {
    const calls: Call[] = []
    const db = new NeonDbClient(fakeExecutor(calls) as never, 'user-1')
    await db.from('leads').select('id, company').eq('archived', false).order('created_at', { ascending: false }).limit(50)

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('query')
    expect(calls[0].sql).toBe(`SELECT id, company FROM "leads" WHERE "archived" = ? ORDER BY "created_at" DESC LIMIT 50`)
    expect(calls[0].values).toEqual([false])
  })

  it('adds OFFSET and LIMIT for range()', async () => {
    const calls: Call[] = []
    const db = new NeonDbClient(fakeExecutor(calls) as never, 'user-1')
    await db.from('leads').select('*').range(100, 149)

    expect(calls[0].sql).toContain('LIMIT 50 OFFSET 100')
  })

  it('translates in() to a parameterised IN list', async () => {
    const calls: Call[] = []
    const db = new NeonDbClient(fakeExecutor(calls) as never, 'user-1')
    await db.from('leads').select('*').in('owner_rep_id', ['a', 'b'])

    expect(calls[0].sql).toContain('"owner_rep_id" IN (?, ?)')
    expect(calls[0].values).toEqual(['a', 'b'])
  })

  it('translates is(null) and is(true) without parameters', async () => {
    const calls: Call[] = []
    const db = new NeonDbClient(fakeExecutor(calls) as never, 'user-1')
    await db.from('leads').select('*').is('owner_rep_id', null).is('archived', true)

    expect(calls[0].sql).toContain('"owner_rep_id" IS NULL')
    expect(calls[0].sql).toContain('"archived" IS TRUE')
    expect(calls[0].values).toEqual([])
  })

  it('parses a PostgREST or() filter string', async () => {
    const calls: Call[] = []
    const db = new NeonDbClient(fakeExecutor(calls) as never, 'user-1')
    await db.from('leads').select('*').or('revenue_identity_id.eq.abc,sender_profile_id.eq.abc')

    expect(calls[0].sql).toContain(`("revenue_identity_id" = ? OR "sender_profile_id" = ?)`)
    expect(calls[0].values).toEqual(['abc', 'abc'])
  })

  it('fetches no rows when head: true is requested', async () => {
    const calls: Call[] = []
    const executor: NeonExecutorApi = {
      async query(text, values = []) {
        calls.push({ method: 'query', sql: text, values })
        return text.includes('count(*)') ? [{ c: 17 }] : []
      },
      async queryInWrite() {
        return []
      },
    }
    const db = new NeonDbClient(executor as never, 'user-1')
    const res = await db.from('reps').select('id', { count: 'exact', head: true }).eq('organization_id', 'org-1')

    // Only the count query runs; the row query is skipped entirely.
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('count(*)::bigint AS c')
    expect(calls[0].sql).toContain('FROM "reps"')
    expect(calls[0].sql).not.toContain('SELECT id FROM')
    expect(res.data).toEqual([])
    expect(res.count).toBe(17)
  })

  it('runs the count query separately when count: exact is requested', async () => {    const calls: Call[] = []
    const executor: NeonExecutorApi = {
      async query(text, values = []) {
        calls.push({ method: 'query', sql: text, values })
        return text.includes('count(*)') ? [{ c: 17 }] : []
      },
      async queryInWrite() {
        return []
      },
    }
    const db = new NeonDbClient(executor as never, 'user-1')
    const res = await db.from('leads').select('*', { count: 'exact' }).eq('archived', false)

    expect(calls).toHaveLength(2)
    expect(calls[1].sql).toContain('count(*)::bigint AS c')
    expect(calls[1].values).toEqual([false])
    expect(res.count).toBe(17)
  })
})

describe('NEON query builder — writes', () => {
  it('inserts and uses the write transaction', async () => {
    const calls: Call[] = []
    const db = new NeonDbClient(fakeExecutor(calls) as never, 'user-1')
    await db.from('leads').insert({ company: 'Acme', contact_name: 'Bob' }).select()

    expect(calls[0].method).toBe('queryInWrite')
    expect(calls[0].sql).toBe(`INSERT INTO "leads" ("company", "contact_name") VALUES (?, ?) RETURNING *`)
    expect(calls[0].values).toEqual(['Acme', 'Bob'])
  })

  it('updates with SET parameters before WHERE parameters', async () => {
    const calls: Call[] = []
    const db = new NeonDbClient(fakeExecutor(calls) as never, 'user-1')
    await db.from('leads').update({ status: 'won' }).eq('id', 'lead-1').select()

    expect(calls[0].method).toBe('queryInWrite')
    expect(calls[0].sql).toBe(`UPDATE "leads" SET "status" = ? WHERE "id" = ? RETURNING *`)
    expect(calls[0].values).toEqual(['won', 'lead-1'])
  })

  it('upserts with an ON CONFLICT DO UPDATE', async () => {
    const calls: Call[] = []
    const db = new NeonDbClient(fakeExecutor(calls) as never, 'user-1')
    await db.from('leads').upsert({ id: 'lead-1', status: 'new' }, { onConflict: 'id' }).select()

    expect(calls[0].sql).toContain('ON CONFLICT ("id") DO UPDATE SET "id" = EXCLUDED."id", "status" = EXCLUDED."status"')
    expect(calls[0].values).toEqual(['lead-1', 'new'])
  })

  it('deletes with filters', async () => {
    const calls: Call[] = []
    const db = new NeonDbClient(fakeExecutor(calls) as never, 'user-1')
    await db.from('leads').delete().eq('archived', true)

    expect(calls[0].method).toBe('queryInWrite')
    expect(calls[0].sql).toBe('DELETE FROM "leads" WHERE "archived" = ?')
    expect(calls[0].values).toEqual([true])
  })

  it('does not add RETURNING when select() never follows a write', async () => {
    const calls: Call[] = []
    const db = new NeonDbClient(fakeExecutor(calls) as never, 'user-1')
    await db.from('leads').delete().eq('id', 'x')

    expect(calls[0].sql).not.toContain('RETURNING')
  })

  it('NEON_WRITE_NO_LIMIT: omits LIMIT/ORDER/OFFSET from writes (PostgreSQL rejects them)', async () => {
    // `.single()` sets limit(1); emitting it on an UPDATE is a syntax error and
    // made every single-row write fail with a masked "Failed" 500.
    const updateCalls: Call[] = []
    const upd = new NeonDbClient(fakeExecutor(updateCalls) as never, 'user-1')
    await upd.from('leads').update({ status: 'won' }).eq('id', 'lead-1').select('*').single()
    expect(updateCalls[0].sql).toBe('UPDATE "leads" SET "status" = ? WHERE "id" = ? RETURNING *')

    const maybeCalls: Call[] = []
    const maybe = new NeonDbClient(fakeExecutor(maybeCalls) as never, 'user-1')
    await maybe.from('leads').update({ status: 'won' }).eq('id', 'lead-1').select('*').maybeSingle()
    expect(maybeCalls[0].sql).not.toContain('LIMIT')

    const deleteCalls: Call[] = []
    const del = new NeonDbClient(fakeExecutor(deleteCalls) as never, 'user-1')
    await del.from('leads').delete().eq('id', 'lead-1').single()
    expect(deleteCalls[0].sql).not.toContain('LIMIT')

    const insertCalls: Call[] = []
    const ins = new NeonDbClient(fakeExecutor(insertCalls) as never, 'user-1')
    await ins.from('leads').insert({ company: 'Acme' }).select('*').single()
    expect(insertCalls[0].sql).not.toContain('LIMIT')
  })
})

describe('NEON executor — identity and placeholders', () => {
  function fakePool() {
    const calls: { sql: string; values: unknown[] }[] = []
    const client = {
      async query(sql: string, values?: unknown[]) {
        calls.push({ sql, values: values ?? [] })
        return { rows: [{ id: 1 }] }
      },
      release() {},
    }
    return {
      calls,
      pool: {
        async query(sql: string, values?: unknown[]) {
          calls.push({ sql, values: values ?? [] })
          return { rows: [{ id: 1 }] }
        },
        async connect() {
          return client
        },
      },
    }
  }

  it('puts the identity GUC in $1 and shifts the builder placeholders', async () => {
    const { calls, pool } = fakePool()
    const executor = new NeonExecutorImpl(pool as never, 'user-1')
    await executor.query('SELECT * FROM "leads" WHERE "archived" = ? LIMIT 10', [false])

    expect(calls).toHaveLength(1)
    expect(calls[0].values).toEqual(['user-1', false])
    expect(calls[0].sql).toMatch(
      /^SELECT q\.\* FROM \(SELECT set_config\('app\.current_user_id', \$1, true\) AS _g\) AS ctx CROSS JOIN LATERAL \(/,
    )
    expect(calls[0].sql).toContain('"archived" = $2')
  })

  it('writes run in a transaction with SET LOCAL', async () => {
    const { calls, pool } = fakePool()
    const executor = new NeonExecutorImpl(pool as never, 'user-1')
    await executor.queryInWrite('DELETE FROM "leads" WHERE "id" = ?', ['x'])

    expect(calls.map((c) => c.sql)).toEqual([
      'BEGIN',
      'SELECT set_config($1, $2, true)',
      'DELETE FROM "leads" WHERE "id" = $1',
      'COMMIT',
    ])
    expect(calls[2].values).toEqual(['x'])
  })

  it('does not shift placeholders when there is no identity in scope', async () => {
    // The service client bypasses RLS and sets no GUC, so the builder's $1 must
    // stay $1. Shifting it would leave the statement referencing a parameter
    // that was never sent.
    const { calls, pool } = fakePool()
    const executor = new NeonExecutorImpl(pool as never, null)
    await executor.query('SELECT * FROM "organization_operating_policy" WHERE "organization_id" = ?', ['org-1'])

    expect(calls[0].sql).toBe('SELECT q.* FROM (SELECT * FROM "organization_operating_policy" WHERE "organization_id" = $1) q')
    expect(calls[0].values).toEqual(['org-1'])
  })
})

describe('NEON query builder — row semantics', () => {
  it('single() errors on zero rows', async () => {
    const db = new NeonDbClient(fakeExecutor([]) as never, 'user-1')
    const res: DbResult<Record<string, unknown>> = await db.from('leads').select('*').single()
    expect(res.data).toBeNull()
    expect(res.error?.message).toMatch(/0 rows/)
  })

  it('maybeSingle() tolerates zero rows', async () => {
    const db = new NeonDbClient(fakeExecutor([]) as never, 'user-1')
    const res = await db.from('leads').select('*').maybeSingle()
    expect(res.data).toBeNull()
    expect(res.error).toBeNull()
  })

  it('refuses to quote a suspicious table identifier', () => {
    const db = new NeonDbClient(fakeExecutor([]) as never, 'user-1')
    expect(() => db.from('leads; drop table leads').select('*')).toThrow(/suspicious identifier/)
  })
})

describe('NEON client', () => {
  it('reports the neon provider', () => {
    const db = new NeonDbClient(fakeExecutor([]) as never, 'user-1')
    expect(db.provider).toBe('neon')
  })

  it('calls a function through rpc()', async () => {
    const calls: Call[] = []
    const db = new NeonDbClient(fakeExecutor(calls) as never, 'user-1')
    const res = await db.rpc('current_org_id', {})

    expect(calls[0].sql).toContain('SELECT * FROM "current_org_id"()')
    expect(res.error).toBeNull()
  })
})

describe('DB provider selection', () => {
  const original = process.env.RELAY_DB_PROVIDER
  const originalPublic = process.env.NEXT_PUBLIC_RELAY_DB_PROVIDER

  afterEach(() => {
    if (original === undefined) delete process.env.RELAY_DB_PROVIDER
    else process.env.RELAY_DB_PROVIDER = original
    if (originalPublic === undefined) delete process.env.NEXT_PUBLIC_RELAY_DB_PROVIDER
    else process.env.NEXT_PUBLIC_RELAY_DB_PROVIDER = originalPublic
  })

  it('defaults to supabase so an opted-out deployment is unchanged', () => {
    delete process.env.RELAY_DB_PROVIDER
    delete process.env.NEXT_PUBLIC_RELAY_DB_PROVIDER
    expect(resolveDbProvider()).toBe('supabase')
  })

  it('reads the browser-facing variable, which Next.js inlines into the bundle', () => {
    // Next.js only inlines NEXT_PUBLIC_* names for the client bundle, so the
    // browser cannot see RELAY_DB_PROVIDER. Without this fallback the browser
    // queries Supabase while the server reads Neon.
    delete process.env.RELAY_DB_PROVIDER
    process.env.NEXT_PUBLIC_RELAY_DB_PROVIDER = 'neon'
    expect(resolveDbProvider()).toBe('neon')
  })
})

describe('NEON select-expression translation', () => {
  it('translates a PostgREST JSON-path alias into a SQL cast', async () => {
    const calls: Call[] = []
    const db = new NeonDbClient(fakeExecutor(calls) as never, 'user-1')
    await db.from('leads').select('id, buyer_intent:canonical_intelligence->buyerIntent, verdict:canonical_intelligence->>verdict')
    expect(calls[0].sql).toContain(`("canonical_intelligence"->>'buyerIntent') AS "buyer_intent"`)
    expect(calls[0].sql).toContain(`("canonical_intelligence"->>'verdict') AS "verdict"`)
  })

  it('leaves a table embed for the caller to resolve', async () => {
    const calls: Call[] = []
    const db = new NeonDbClient(fakeExecutor(calls) as never, 'user-1')
    await db.from('identity_assignments').select('id, identity:revenue_identities(id, name)')
    expect(calls[0].sql).toContain('identity:revenue_identities(id, name)')
  })
})

describe('NEON error and value parity with PostgREST', () => {
  it('expands not-in into a parameterised list', async () => {
    const calls: Call[] = []
    const db = new NeonDbClient(fakeExecutor(calls) as never, 'user-1')
    await db.from('action_events').select('*').not('lead_id', 'in', ['a', 'b'])

    expect(calls[0].sql).toContain('NOT ("lead_id" IN (?, ?))')
    expect(calls[0].values).toEqual(['a', 'b'])
  })

  it('treats not-in over an empty list as no exclusion', async () => {
    const calls: Call[] = []
    const db = new NeonDbClient(fakeExecutor(calls) as never, 'user-1')
    await db.from('action_events').select('*').not('lead_id', 'in', [])

    expect(calls[0].sql).toContain('TRUE')
    expect(calls[0].values).toEqual([])
  })

  it('resolves a failed query with { data: null, error } instead of rejecting', async () => {
    // supabase-js resolves a failed builder rather than throwing; call sites
    // check `.error`, so the Neon adapter must not reject either.
    const executor: NeonExecutorApi = {
      query: async () => { throw new Error('Neon query failed: column "connects_used" does not exist') },
      queryInWrite: async () => { throw new Error('Neon write failed: column "connects_used" does not exist') },
    }
    const db = new NeonDbClient(executor, null)

    const res = await db.from('upwork_jobs').select('connects_used')
    expect(res.data).toBeNull()
    expect(res.error?.message).toContain('connects_used')

    const single = await db.from('upwork_jobs').select('connects_cost').eq('id', 'j1').single()
    expect(single.data).toBeNull()
    expect(single.error?.message).toContain('connects_used')
  })

  it('leaves temporal columns as text while delegating other types', () => {
    // The driver parses dates and timestamps into Date objects; PostgREST emits
    // their text form, and callers compare and sort these values as strings.
    expect(neonTypeParser(1082)('2026-10-21')).toBe('2026-10-21')
    expect(neonTypeParser(1114)('2026-10-21 11:05:34.291333')).toBe('2026-10-21 11:05:34.291333')
    expect(neonTypeParser(1184)('2026-10-21 11:05:34.291333+00')).toBe('2026-10-21 11:05:34.291333+00')
    expect(neonTypeParser(23)('42')).toBe(42)
  })
})
