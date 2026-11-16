/**
 * Regression tests for the Postgres executor's request-scoped connection reuse.
 *
 * Root cause guarded here: the executor used to wrap every read in
 * BEGIN + set_config + query + COMMIT (four round trips). On a Dallas→Singapore
 * connection (~210ms RTT) that made an authenticated `/api/me/status` take
 * ~14.7s. A read must now be one round trip, with the RLS identity set once per
 * connection and reset on release.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => Promise<void>>,
  afterThrows: false,
}))

vi.mock('next/server', () => ({
  after: (fn: () => Promise<void>) => {
    if (state.afterThrows) throw new Error('no request scope')
    state.afterCallbacks.push(fn)
  },
}))

import { PostgresExecutorImpl, postgresDbClient } from '@/lib/db/postgres'

interface Recorded {
  text: string
  values?: unknown[]
}

function fakeClient() {
  const calls: Recorded[] = []
  const client = {
    calls,
    query(text: string, values?: unknown[]) {
      calls.push({ text, values })
      return Promise.resolve({ rows: [] })
    },
    release: vi.fn(),
  }
  return client
}

function fakePool(client: ReturnType<typeof fakeClient>) {
  return {
    connect: vi.fn(() => Promise.resolve(client)),
  } as unknown as import('pg').Pool
}

describe('PostgresExecutorImpl connection reuse', () => {
  beforeEach(() => {
    state.afterCallbacks.length = 0
    state.afterThrows = false
  })

  it('runs five reads as one connect, one identity set and five queries', async () => {
    const client = fakeClient()
    const executor = new PostgresExecutorImpl(fakePool(client), 'user-1')

    for (let i = 0; i < 5; i += 1) {
      await executor.query('SELECT * FROM leads WHERE id = ?', [`id-${i}`])
    }

    const texts = client.calls.map((c) => c.text)
    expect(texts.filter((t) => t.includes('set_config'))).toHaveLength(1)
    // Session-level, not transaction-local: the identity must outlive one query.
    const identity = client.calls.find((c) => c.text.includes('set_config'))
    expect(identity?.values).toEqual(['app.current_user_id', 'user-1'])
    expect(identity?.text).toContain('false')
    expect(texts.filter((t) => t === 'BEGIN' || t === 'COMMIT')).toHaveLength(0)
    expect(texts.filter((t) => t.startsWith('SELECT * FROM leads'))).toHaveLength(5)
    // Held for the request; released by the after() callback.
    expect(client.release).not.toHaveBeenCalled()
    expect(state.afterCallbacks).toHaveLength(1)

    await state.afterCallbacks[0]()
    const reset = client.calls[client.calls.length - 1]
    expect(reset.text).toContain('RESET app.current_user_id')
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('keeps a write in a transaction on the reused connection', async () => {
    const client = fakeClient()
    const executor = new PostgresExecutorImpl(fakePool(client), 'user-1')

    await executor.queryInWrite('INSERT INTO messages (id) VALUES (?)', ['m1'])

    const texts = client.calls.map((c) => c.text)
    expect(texts).toContain('BEGIN')
    expect(texts).toContain('COMMIT')
    expect(texts.filter((t) => t.startsWith('INSERT INTO messages'))).toHaveLength(1)
  })

  it('resets the identity for the service client so a pooled connection cannot leak a user', async () => {
    const client = fakeClient()
    const executor = new PostgresExecutorImpl(fakePool(client), null)

    await executor.query('SELECT 1')
    const identity = client.calls.find((c) => c.text.includes('set_config'))
    expect(identity?.values).toEqual(['app.current_user_id', ''])
    expect(identity?.text).toContain('false')
  })

  it('releases after every statement when after() is unavailable (scripts/tests)', async () => {
    state.afterThrows = true
    const client = fakeClient()
    const executor = new PostgresExecutorImpl(fakePool(client), 'user-1')

    await executor.query('SELECT 1')
    await executor.query('SELECT 2')

    expect(client.release).toHaveBeenCalledTimes(2)
  })
})

describe('postgresDbClient', () => {
  it('reports the postgres provider and binds the user id', () => {
    const client = postgresDbClient('user-1', fakePool(fakeClient()))
    expect(client.provider).toBe('postgres')
  })
})
