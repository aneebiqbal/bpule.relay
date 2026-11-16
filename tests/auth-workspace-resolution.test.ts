/**
 * Workspace-resolution contract.
 *
 * A database failure while resolving the signed-in rep must surface as an
 * error (HTTP 500), never as "no workspace mapping" (HTTP 409). Only a real
 * absent row is a 409. This guards the P0 where connection timeouts were
 * misreported as a missing workspace.
 */
import { describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => {
  const state: {
    user: { id: string; email: string } | null
    results: Record<string, { data?: unknown; error?: unknown }>
  } = { user: { id: 'u1', email: 'a@b.c' }, results: {} }

  function dbFrom() {
    return {
      from(table: string) {
        const r = state.results[table] ?? { data: null, error: null }
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: r.data ?? null, error: r.error ?? null }),
          then: (resolve: (value: unknown) => unknown) =>
            resolve({ data: r.data ?? null, error: r.error ?? null }),
        }
        return chain
      },
    }
  }

  return { state, dbFrom }
})

vi.mock('@/lib/ai/config', () => ({ isDemoMode: () => false }))
vi.mock('@/lib/auth/provider', () => ({
  getAuthProvider: async () => ({ getSession: async () => ({ user: harness.state.user }) }),
}))
vi.mock('@/lib/db/provider', () => ({ getDbClient: async () => harness.dbFrom() }))
vi.mock('@/lib/store/demo-registry', () => ({
  getDemoStore: () => {
    throw new Error('demo store must not be used')
  },
}))

async function loadCurrentUser() {
  vi.resetModules()
  return import('@/lib/auth/current')
}

const REP_ROW = {
  id: 'r1',
  name: 'Rep',
  role: 'member',
  organization_id: 'o1',
  created_at: '2026-01-01T00:00:00.000Z',
  timezone: 'UTC',
}

const ORG_ROW = {
  id: 'o1',
  name: 'Org',
  plan: 'active',
  billing_customer_id: null,
  timezone: 'UTC',
  working_days: [1, 2, 3, 4, 5],
  holidays: [],
  created_at: '2026-01-01T00:00:00.000Z',
  settings: {},
}

describe('getCurrentUser workspace resolution', () => {
  it('returns the rep, org and voice profile when the mapping exists', async () => {
    harness.state.user = { id: 'u1', email: 'a@b.c' }
    harness.state.results = {
      reps: { data: [REP_ROW] },
      organizations: { data: ORG_ROW },
      voice_profiles: { data: null },
    }
    const { getCurrentUser } = await loadCurrentUser()

    const user = await getCurrentUser()
    expect(user?.rep.id).toBe('r1')
    expect(user?.organization.id).toBe('o1')
    expect(user?.authUserId).toBe('u1')
  })

  it('returns null for a genuine missing mapping (no rep row)', async () => {
    harness.state.user = { id: 'u1', email: 'a@b.c' }
    harness.state.results = { reps: { data: [] } }
    const { getCurrentUser } = await loadCurrentUser()

    await expect(getCurrentUser()).resolves.toBeNull()
  })

  it('returns null when there is no session', async () => {
    harness.state.user = null
    harness.state.results = {}
    const { getCurrentUser } = await loadCurrentUser()

    await expect(getCurrentUser()).resolves.toBeNull()
  })

  it('throws AuthDatabaseError on a rep-lookup timeout (never a false 409)', async () => {
    harness.state.user = { id: 'u1', email: 'a@b.c' }
    harness.state.results = {
      reps: { data: null, error: { message: 'timeout exceeded when trying to connect' } },
    }
    const { getCurrentUser, AuthDatabaseError } = await loadCurrentUser()

    await expect(getCurrentUser()).rejects.toBeInstanceOf(AuthDatabaseError)
  })

  it('throws AuthDatabaseError when the organization lookup fails', async () => {
    harness.state.user = { id: 'u1', email: 'a@b.c' }
    harness.state.results = {
      reps: { data: [REP_ROW] },
      organizations: { data: null, error: { message: 'connection reset' } },
    }
    const { getCurrentUser, AuthDatabaseError } = await loadCurrentUser()

    await expect(getCurrentUser()).rejects.toBeInstanceOf(AuthDatabaseError)
  })
})
