import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertRepCannotUseTeamScope,
  filterLeadsByTeamOwners,
  resolveLeadListScope,
} from '@/lib/leads/lead-scope'
import {
  derivePipelineStage,
  leadPriority,
  parseLeadsQuery,
  sortLeadRows,
  type LeadRow,
} from '@/components/leads/pipeline-utils'
import type { AuthContext } from '@/lib/auth/organization'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

function auth(partial: Partial<AuthContext> & Pick<AuthContext, 'repId' | 'orgId'>): AuthContext {
  return {
    orgName: 'Org',
    organizationRole: 'MEMBER',
    teamMemberships: [],
    managedTeamIds: [],
    memberTeamIds: [],
    capabilities: new Set(),
    isOwner: false,
    isAdmin: false,
    isManager: false,
    isMember: true,
    ...partial,
  }
}

function lead(partial: Partial<LeadRow> & Pick<LeadRow, 'id' | 'company'>): LeadRow {
  return {
    contactName: 'Alex',
    status: 'new',
    createdAt: '2026-01-01T00:00:00Z',
    ...partial,
  } as LeadRow
}

describe('LEAD_ASSIGN_TASK_INTEGRATION', () => {
  it('LEAD_ASSIGN_TASK_INTEGRATION: table posts to Phase 6 /api/tasks and shows open counts', () => {
    const table = read('src/components/leads/leads-table.tsx')
    expect(table).toContain("'/api/tasks'")
    expect(table).toContain('leadId:')
    expect(table).toContain('openAssignedTaskCount')
    expect(table).toContain('open task')
    const enrich = read('src/lib/leads/board-rows.ts')
    expect(enrich).toContain('assigned_tasks')
    expect(enrich).toContain('openAssignedTaskCount')
  })
})

describe('LEADS_MANAGER_TEAM_SCOPE', () => {
  it('LEADS_MANAGER_TEAM_SCOPE: managers can request team; never org by default', () => {
    const manager = auth({
      repId: 'mgr',
      orgId: 'org',
      isManager: true,
      managedTeamIds: ['t1'],
    })
    expect(resolveLeadListScope({ auth: manager, isProductAdmin: false, requested: 'team' }).mode).toBe('team')
    expect(resolveLeadListScope({ auth: manager, isProductAdmin: false }).mode).toBe('profile')

    const owners = new Set(['rep-a', 'rep-b'])
    const rows = [
      lead({ id: '1', company: 'A', ownerRepId: 'rep-a' }),
      lead({ id: '2', company: 'B', ownerRepId: 'outsider' }),
      lead({ id: '3', company: 'C', ownerRepId: 'mgr' }),
    ]
    const filtered = filterLeadsByTeamOwners(rows, owners, 'mgr')
    expect(filtered.map((r) => r.id).sort()).toEqual(['1', '3'])
  })
})

describe('LEADS_ADMIN_ORG_SCOPE', () => {
  it('LEADS_ADMIN_ORG_SCOPE: product admin resolves to org', () => {
    const admin = auth({
      repId: 'admin',
      orgId: 'org',
      isAdmin: true,
      organizationRole: 'ADMIN',
    })
    expect(resolveLeadListScope({ auth: admin, isProductAdmin: true }).mode).toBe('org')
  })
})

describe('LEADS_REP_NO_TEAM_SCOPE', () => {
  it('LEADS_REP_NO_TEAM_SCOPE: reps cannot escalate to team', () => {
    const rep = auth({ repId: 'rep', orgId: 'org' })
    expect(resolveLeadListScope({ auth: rep, isProductAdmin: false, requested: 'team' }).mode).toBe('profile')
    expect(assertRepCannotUseTeamScope('team', false)).toBe('profile')
  })
})

describe('LEADS_PROFILE_OWNER_FILTER_COMBINATION', () => {
  it('LEADS_PROFILE_OWNER_FILTER_COMBINATION: URL parses q+profile+stage+page together', () => {
    const q = parseLeadsQuery({
      q: 'acme',
      profile: 'mehak',
      stage: 'needs_reply',
      page: '2',
      owner: 'rep-1',
      scope: 'org',
    })
    expect(q.q).toBe('acme')
    expect(q.profile).toBe('mehak')
    expect(q.stage).toBe('needs_reply')
    expect(q.page).toBe(2)
    expect(q.owner).toBe('rep-1')
    expect(q.scope).toBe('org')
  })
})

describe('LEADS_PAGINATION_TRUTH', () => {
  it('LEADS_PAGINATION_TRUTH: stable order, no duplicates, page math for 25..1000+', () => {
    const sizes = [25, 100, 250, 500, 1000]
    for (const n of sizes) {
      const rows = Array.from({ length: n }, (_, i) =>
        lead({
          id: `id-${String(i).padStart(4, '0')}`,
          company: `Co ${i}`,
          contactName: `Person ${i}`,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
        }),
      )
      const sorted = sortLeadRows(rows, 'created', 'desc')
      const ids = sorted.map((r) => r.id)
      expect(new Set(ids).size).toBe(n)
      const pageSize = 50
      const pageCount = Math.max(1, Math.ceil(n / pageSize))
      const seen = new Set<string>()
      for (let page = 1; page <= pageCount; page++) {
        const start = (page - 1) * pageSize
        const slice = sorted.slice(start, start + pageSize)
        for (const row of slice) {
          expect(seen.has(row.id)).toBe(false)
          seen.add(row.id)
        }
      }
      expect(seen.size).toBe(n)
    }
  })
})

describe('LEADS_TABLE_PIPELINE_FULL_PARITY', () => {
  it('LEADS_TABLE_PIPELINE_FULL_PARITY: same helpers for stage and priority', () => {
    const table = read('src/components/leads/leads-table.tsx')
    const board = read('src/components/leads/leads-board-v2.tsx')
    expect(table).toContain('derivePipelineStage')
    expect(table).toContain('leadPriority')
    expect(board).toContain('derivePipelineStage')
    expect(board).toContain('leadPriority')

    const row = lead({
      id: 'p',
      company: 'Acme',
      status: 'replied',
      contactName: 'Sam',
      lastInboundAt: '2026-01-02T00:00:00Z',
      lastOutboundAt: '2026-01-01T00:00:00Z',
      senderProfileName: 'Mehak Seedat',
    })
    expect(derivePipelineStage(row)).toBe('needs_reply')
    expect(leadPriority(row)).toBeTruthy()
  })
})
