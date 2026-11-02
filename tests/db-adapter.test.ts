import { describe, expect, it } from 'vitest'
import { NeonDbClient, NeonExecutorImpl, type NeonExecutorApi } from '@/lib/db/neon'
import type { DbResult } from '@/lib/db/neon'

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
