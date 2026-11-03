/**
 * Prospect loading performance contract.
 *
 * The default `/prospect` view is Analyze, which must not pay for the lead
 * board. These gates pin exactly what each view reads on first render.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  createScoutStore: async () => ({ listRecentProspects: (limit?: number) => mocks.listRecentProspects(limit) }),
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

import { loadProspectsView, PROSPECT_RECENT_LIMIT } from '@/lib/prospect/prospects-view'

/** Lead rows with the stage-relevant fields the fixtures need. */
const lead = (id: string, status: string, verdict: string | null = null) =>
  ({ id, status, verdict }) as never

const recentRow = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: 'Atai Barkai',
  company: 'CopilotKit',
  title: 'CEO',
  location: null,
  score: 50,
  senderProfileId: 'p1',
  status: 'captured',
  convertedLeadId: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  lastActivityAt: '2026-11-01T00:00:00.000Z',
  ...over,
})

const readSource = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveActiveWorkspace.mockResolvedValue({ id: 'ws-1', identityName: 'Mehak LinkedIn' })
  mocks.loadBoardData.mockResolvedValue({
    leads: [lead('l1', 'new'), lead('l2', 'replied')],
    orgView: false,
    reps: [],
    workspace: null,
  })
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

describe('PROSPECT_ANALYZE_ZERO_BOARD_LOAD', () => {
  it('loads no board on the default Analyze view', async () => {
    await loadProspectsView('analyze')
    expect(mocks.loadBoardData).not.toHaveBeenCalled()
  })

  it('returns only workspace context for Analyze', async () => {
    const data = await loadProspectsView('analyze')
    expect(data.tab).toBe('analyze')
    expect(data.recent).toEqual([])
    expect(data.saved).toEqual([])
    expect(data.watchlist).toEqual([])
    expect(data.workspace).toMatchObject({ id: 'ws-1' })
  })
})

describe('PROSPECT_ANALYZE_ZERO_MESSAGE_LOAD', () => {
  it('never reaches the message path on Analyze', async () => {
    await loadProspectsView('analyze')
    // loadBoardData (via enrichLeads) is the only route to messages.
    expect(mocks.loadBoardData).not.toHaveBeenCalled()
  })

  it('the loader source contains no message query', () => {
    const source = readSource('src/lib/prospect/prospects-view.ts')
    expect(source).not.toContain("'messages'")
    expect(source).not.toContain('"messages"')
  })
})

describe('PROSPECT_ANALYZE_ZERO_TASK_LOAD', () => {
  it('never reaches assigned_tasks on Analyze', async () => {
    await loadProspectsView('analyze')
    expect(mocks.loadBoardData).not.toHaveBeenCalled()
  })

  it('the loader source contains no task query', () => {
    expect(readSource('src/lib/prospect/prospects-view.ts')).not.toContain('assigned_tasks')
  })
})

describe('PROSPECT_ANALYZE_ZERO_STATE_LOAD', () => {
  it('never reaches conversation_states on Analyze', async () => {
    await loadProspectsView('analyze')
    expect(mocks.loadBoardData).not.toHaveBeenCalled()
  })

  it('the loader source contains no conversation-state query', () => {
    expect(readSource('src/lib/prospect/prospects-view.ts')).not.toContain('conversation_states')
  })
})

describe('PROSPECT_TAB_LOADS_ONLY_ACTIVE_VIEW', () => {
  it('Analyze loads nothing but workspace context', async () => {
    await loadProspectsView('analyze')
    expect(mocks.loadBoardData).not.toHaveBeenCalled()
    expect(mocks.listRecentProspects).not.toHaveBeenCalled()
    expect(mocks.createServerSupabase).not.toHaveBeenCalled()
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
    mocks.listRecentProspects.mockResolvedValue([recentRow()])
    const data = await loadProspectsView('recent')
    expect(mocks.listRecentProspects).toHaveBeenCalledTimes(1)
    expect(mocks.createServerSupabase).toHaveBeenCalledTimes(1)
    expect(data.profiles).toMatchObject({ p1: 'Profile' })
  })
})

describe('PROSPECT_RECENT_BOUNDED', () => {
  it('asks for a bounded window, not the full history', async () => {
    await loadProspectsView('recent')
    expect(mocks.listRecentProspects).toHaveBeenCalledWith(PROSPECT_RECENT_LIMIT)
    expect(PROSPECT_RECENT_LIMIT).toBeGreaterThan(0)
    expect(PROSPECT_RECENT_LIMIT).toBeLessThanOrEqual(50)
  })
})

describe('PROSPECT_SAVED_SCOPED', () => {
  it('returns only leads a captured prospect was converted into', async () => {
    mocks.listRecentProspects.mockResolvedValue([
      recentRow({ id: 'c1', status: 'converted', convertedLeadId: 'l1' }),
      recentRow({ id: 'c2', status: 'converted', convertedLeadId: 'l9' }),
      recentRow({ id: 'c3', status: 'captured', convertedLeadId: null }),
    ])
    const data = await loadProspectsView('saved')
    expect(data.saved.map((row) => row.id)).toEqual(['l1'])
    expect(data.watchlist).toEqual([])
    expect(data.recent).toEqual([])
  })
})

describe('PROSPECT_WATCHLIST_SCOPED', () => {
  it('returns only Observe-stage leads', async () => {
    mocks.loadBoardData.mockResolvedValue({
      leads: [lead('obs', 'new', 'skip'), lead('active', 'replied')],
      orgView: false,
      reps: [],
      workspace: null,
    })
    const data = await loadProspectsView('watchlist')
    expect(data.watchlist.map((row) => row.id)).toEqual(['obs'])
    expect(data.saved).toEqual([])
    expect(data.recent).toEqual([])
  })
})

describe('PROSPECT_BOARD_FAILURE_ISOLATED', () => {
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
