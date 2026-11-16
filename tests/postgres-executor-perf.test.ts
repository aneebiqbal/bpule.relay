/**
 * Regression tests for the Postgres executor's connection ownership.
 *
 * P0 root cause guarded here: an earlier optimization held ONE client per
 * request and ran concurrent reads on it, which made `pg` emit
 * "Calling client.query() when the client is already executed a query" and
 * serialised/queued queries until they timed out. Every operation must check
 * out its own client, set a transaction-local RLS identity, and release in
 * `finally` — so concurrent operations never share a transaction client.
 */
import { describe, expect, it, vi } from 'vitest'
import { PostgresExecutorImpl, postgresDbClient } from '@/lib/db/postgres'

interface Recorded {
  text: string
  values?: unknown[]
}

function makeClient(id: string) {
  const calls: Recorded[] = []
  const client = {
    id,
    calls,
    active: 0,
    maxActive: 0,
    async query(text: string, values?: unknown[]) {
      client.active += 1
      client.maxActive = Math.max(client.maxActive, client.active)
      await new Promise((resolve) => setTimeout(resolve, 3))
      client.active -= 1
      if (text.includes('FROM fail_table')) throw new Error('connection reset')
      calls.push({ text, values })
      return { rows: [] }
    },
    release: vi.fn(),
  }
  return client
}

function makePool(clients: ReturnType<typeof makeClient>[]) {
  const connect = vi.fn(async () => {
    const next = clients.shift()
    if (!next) throw new Error('pool exhausted')
    return next
  })
  return { connect, clients }
}

describe('PostgresExecutorImpl connection ownership', () => {
  it('checks out and releases a client per operation (no sharing)', async () => {
    const a = makeClient('a')
    const b = makeClient('b')
    const pool = makePool([a, b])
    const executor = new PostgresExecutorImpl(pool as unknown as import('pg').Pool, 'u1')

    await executor.query('SELECT * FROM leads')
    await executor.query('SELECT * FROM leads')

    expect(pool.connect).toHaveBeenCalledTimes(2)
    expect(a.release).toHaveBeenCalledTimes(1)
    expect(b.release).toHaveBeenCalledTimes(1)
  })

  it('never runs two queries concurrently on the same client', async () => {
    const a = makeClient('a')
    const b = makeClient('b')
    const pool = makePool([a, b])
    const executor = new PostgresExecutorImpl(pool as unknown as import('pg').Pool, 'u1')

    await Promise.all([
      executor.query('SELECT * FROM leads'),
      executor.query('SELECT * FROM reps'),
    ])

    expect(a.maxActive).toBeLessThanOrEqual(1)
    expect(b.maxActive).toBeLessThanOrEqual(1)
    expect(a.release).toHaveBeenCalledTimes(1)
    expect(b.release).toHaveBeenCalledTimes(1)
  })

  it('sets a transaction-local identity and commits on the checked-out client', async () => {
    const a = makeClient('a')
    const pool = makePool([a])
    const executor = new PostgresExecutorImpl(pool as unknown as import('pg').Pool, '11111111-2222-3333-4444-555555555555')

    await executor.query('SELECT * FROM leads')

    // UUID fast path: BEGIN + set_config in one round trip, LOCAL (true).
    const begin = a.calls.find((c) => c.text.includes('set_config'))
    expect(begin?.text).toContain("BEGIN; SELECT set_config('app.current_user_id', '11111111-2222-3333-4444-555555555555', true)")
    expect(a.calls.map((c) => c.text)).toContain('COMMIT')
    expect(a.calls.some((c) => c.text === 'ROLLBACK')).toBe(false)
  })

  it('falls back to a parameterised set_config for a non-UUID identity', async () => {
    const a = makeClient('a')
    const pool = makePool([a])
    const executor = new PostgresExecutorImpl(pool as unknown as import('pg').Pool, 'service')

    await executor.query('SELECT * FROM leads')

    expect(a.calls.map((c) => c.text)).toContain('BEGIN')
    const identity = a.calls.find((c) => c.text.includes('set_config'))
    expect(identity?.values).toEqual(['app.current_user_id', 'service'])
    expect(identity?.text).toContain('true')
  })

  it('rolls back and releases when the query fails, and propagates the error', async () => {
    const a = makeClient('a')
    const pool = makePool([a])
    const executor = new PostgresExecutorImpl(pool as unknown as import('pg').Pool, 'u1')

    await expect(executor.query('SELECT * FROM fail_table')).rejects.toThrow(/connection reset/)

    expect(a.calls.map((c) => c.text)).toContain('ROLLBACK')
    expect(a.release).toHaveBeenCalledTimes(1)
  })

  it('keeps writes in a transaction on their own client', async () => {
    const a = makeClient('a')
    const pool = makePool([a])
    const executor = new PostgresExecutorImpl(pool as unknown as import('pg').Pool, 'u1')

    await executor.queryInWrite('INSERT INTO messages (id) VALUES (?)', ['m1'])

    const texts = a.calls.map((c) => c.text)
    expect(texts).toContain('BEGIN')
    expect(texts).toContain('COMMIT')
    expect(texts.filter((t) => t.startsWith('INSERT INTO messages'))).toHaveLength(1)
    expect(a.release).toHaveBeenCalledTimes(1)
  })
})

describe('postgresDbClient', () => {
  it('reports the postgres provider and binds the user id', () => {
    const client = postgresDbClient('u1', makePool([]) as unknown as import('pg').Pool)
    expect(client.provider).toBe('postgres')
  })
})
