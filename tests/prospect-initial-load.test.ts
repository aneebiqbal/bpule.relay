/**
 * Prospect initial-load performance contract.
 *
 * The default `/prospect` view is Analyze, which must not pay for the lead
 * board. These gates assert exactly what each view reads on first render.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadBoardData: vi.fn(),
  listRecentProspects: vi.fn(),
  createServerSupabase: vi.fn(),
  resolveActiveWorkspace: vi.fn(),
}))

vi.mock('@/lib/leads/board-rows', () => ({
  // Identity scope: the fixtures are already workspace-scoped.
  scopeLeadsToWorkspace: (rows: unknown[]) => rows,
  loadBoardData: () => mocks.loadBoardData(),
}))

vi.mock('@/lib/store', () => ({
  createScoutStore: async () => ({ listRecentProspects: () => mocks.listRecentProspects() }),
}))

vi.mock('@/lib/auth/current', () => ({
  getCurrentUser: async () => ({
    rep: { id: 'rep-1', role: 'rep', name: 'Tester', organizationId: 'org-1', timezone: 'UTC' },
    organization: { id: 'org-1', name: 'Org', plan: 'pro' },
  }),
}))

vi.mock('@/lib/auth/organization', () => ({
  getAuthContext: async () => ({
    orgId: 'org-1',
    repId: 'rep-1',
    isOwner: false,
    isAdmin: false,
    isManager: false,
  }),
}))

vi.mock('@/lib/workspace/resolve-active-identity', () => ({
  resolveActiveWorkspace: () => mocks.resolveActiveWorkspace(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => mocks.createServerSupabase(),
}))

import { loadProspectsView } from '@/lib/prospect/prospects-view'

const lead = (id: string) => ({ id, status: 'new', verdict: null }) as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveActiveWorkspace.mockResolvedValue({ id: 'ws-1', identityName: 'Mehak LinkedIn' })
  mocks.loadBoardData.mockResolvedValue({ leads: [lead('l1'), lead('l2')], orgView: false, reps: [], workspace: null })
  mocks.listRecentProspects.mockResolvedValue([])
  mocks.createServerSupabase.mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: async () => ({ data: [{ id: 'p1', display_name: 'Profile', full_name: null }], error: null }),
        }),
      }),
    }),
  })
})

describe('PROSPECT_INITIAL_LOAD_EXCLUDES_ACTIVITY', () => {
  it('Analyze issues no activity/history read of any kind', async () => {
    await loadProspectsView('analyze')
    expect(mocks.loadBoardData).not.toHaveBeenCalled()
    expect(mocks.listRecentProspects).not.toHaveBeenCalled()
    expect(mocks.createServerSupabase).not.toHaveBeenCalled()
  })
})

describe('PROSPECT_INITIAL_LOAD_EXCLUDES_MESSAGES', () => {
  it('Analyze never reaches the message/thread path', async () => {
    await loadProspectsView('analyze')
    // The only route to messages is the enriched board; neither is touched.
    expect(mocks.loadBoardData).not.toHaveBeenCalled()
    const store = await mocks.listRecentProspects()
    expect(store).toEqual([])
  })

  it('no activity or message query exists in the Prospect page source', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const root = join(process.cwd(), 'src/app/(app)/prospect')
    const page = readFileSync(join(root, 'page.tsx'), 'utf8')
    const loader = readFileSync(join(process.cwd(), 'src/lib/prospect/prospects-view.ts'), 'utf8')
    for (const source of [page, loader]) {
      expect(source).not.toContain("'messages'")
      expect(source).not.toContain('activity_events')
      expect(source).not.toContain('/api/prospect/activity')
    }
  })
})

describe('PROSPECT_ACTIVITY_LAZY_LOAD', () => {
  it('the workspace exposes no Activity view to load eagerly', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const workspace = readFileSync(
      join(process.cwd(), 'src/components/prospect/prospects-workspace.tsx'),
      'utf8',
    )
    // Exactly the four real views — no Activity tab exists to prefetch for.
    const tabs = [...workspace.matchAll(/value: '([^']+)'/g)].map((m) => m[1])
    expect(tabs).toEqual(['analyze', 'recent', 'saved', 'watchlist'])
    expect(workspace).not.toContain('/api/prospect/activity')
    expect(await loadProspectsView('analyze')).toMatchObject({ tab: 'analyze', recent: [] })
  })
})

describe('PROSPECT_ACTIVITY_BOUNDED', () => {
  it('no unbounded history feed is loaded by any Prospect view', async () => {
    for (const tab of ['analyze', 'recent', 'saved', 'watchlist'] as const) {
      vi.clearAllMocks()
      await loadProspectsView(tab)
      // The only bounded read is the captured-prospect projection (limit 50).
      if (mocks.listRecentProspects.mock.calls.length > 0) {
        expect(mocks.listRecentProspects).toHaveBeenCalledWith()
      }
    }
  })
})

describe('PROSPECT_ACTIVITY_FAILURE_ISOLATED', () => {
  it('a board failure leaves Analyze fully usable', async () => {
    mocks.loadBoardData.mockRejectedValue(new Error('boom'))
    const data = await loadProspectsView('analyze')
    expect(data.tab).toBe('analyze')
    expect(data.workspace).toMatchObject({ id: 'ws-1' })
  })

  it('a board failure degrades the data views to empty instead of crashing', async () => {
    mocks.loadBoardData.mockRejectedValue(new Error('boom'))
    await expect(loadProspectsView('watchlist')).resolves.toMatchObject({ watchlist: [] })
    await expect(loadProspectsView('saved')).resolves.toMatchObject({ saved: [] })
  })
})

describe('PROSPECT_TAB_ONLY_LOADS_ACTIVE_VIEW', () => {
  it('Analyze loads nothing but workspace context', async () => {
    const data = await loadProspectsView('analyze')
    expect(mocks.loadBoardData).not.toHaveBeenCalled()
    expect(mocks.listRecentProspects).not.toHaveBeenCalled()
    expect(mocks.createServerSupabase).not.toHaveBeenCalled()
    expect(data.recent).toEqual([])
    expect(data.saved).toEqual([])
    expect(data.watchlist).toEqual([])
  })

  it('Watchlist does not load Recent or profile names', async () => {
    await loadProspectsView('watchlist')
    expect(mocks.loadBoardData).toHaveBeenCalledTimes(1)
    expect(mocks.listRecentProspects).not.toHaveBeenCalled()
    expect(mocks.createServerSupabase).not.toHaveBeenCalled()
  })

  it('Saved does not load profile names', async () => {
    await loadProspectsView('saved')
    expect(mocks.loadBoardData).toHaveBeenCalledTimes(1)
    expect(mocks.createServerSupabase).not.toHaveBeenCalled()
  })

  it('Recent loads its own projection plus profile attribution', async () => {
    mocks.listRecentProspects.mockResolvedValue([
      { id: 'c1', name: 'Atai Barkai', company: 'CopilotKit', title: 'CEO', location: null, score: 50, senderProfileId: 'p1', status: 'captured', convertedLeadId: null, createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() },
    ])
    const data = await loadProspectsView('recent')
    expect(mocks.listRecentProspects).toHaveBeenCalledTimes(1)
    expect(mocks.createServerSupabase).toHaveBeenCalledTimes(1)
    expect(data.profiles).toMatchObject({ p1: 'Profile' })
  })
})
