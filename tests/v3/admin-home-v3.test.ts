/** Admin / Owner Command Center V3 product contracts. */
import { describe, expect, it } from 'vitest'
import {
  buildAdminV3Activity,
  buildAdminV3Attention,
  buildAdminV3Health,
  buildAdminV3Pipeline,
  buildAdminV3QuickActions,
  buildAdminV3TeamRows,
  sanitizeAdminV3Error,
} from '@/lib/admin/v3-command-present'
import type { AdminCommandCenterData } from '@/lib/team/admin-command-summary'
import type { AttentionSignal } from '@/lib/team/attention-policy'
import type { ManagerActivityItem, ManagerTeamRow } from '@/lib/team/manager-home-summary'

function signal(overrides: Partial<AttentionSignal> = {}): AttentionSignal {
  return {
    category: 'REPLIES_WAITING',
    repId: 'rep-1',
    repName: 'Mehak Seedat',
    count: 4,
    reason: '4 replies waiting · oldest 12h',
    severity: 'critical',
    oldestAgeHours: 12,
    href: '/team/rep-1?focus=replies',
    ...overrides,
  }
}

function teamRow(overrides: Partial<ManagerTeamRow> = {}): ManagerTeamRow {
  return {
    repId: 'rep-1',
    repName: 'Mehak Seedat',
    activeProfile: 'Mehak LinkedIn',
    channel: 'linkedin',
    completedToday: 12,
    repliesWaiting: 4,
    followUpsOverdue: 1,
    highPriority: 3,
    overdueTasks: 1,
    meetings: 2,
    wins: 0,
    targetPct: 78,
    status: 'Attention',
    ...overrides,
  }
}

function activity(overrides: Partial<ManagerActivityItem> = {}): ManagerActivityItem {
  return {
    id: 'ae:1',
    label: 'Positive reply',
    detail: 'Mehak',
    occurredAt: '2026-11-02T10:42:00Z',
    href: '/leads/lead-1',
    ...overrides,
  }
}

function data(overrides: Partial<AdminCommandCenterData> = {}): AdminCommandCenterData {
  return {
    orgName: 'Relay',
    isOwner: false,
    health: {
      activeOpportunities: 128,
      repliesWaiting: 14,
      repliesCritical: 5,
      followUpsOverdue: 6,
      overdueTasks: 3,
      meetingsThisWeek: 7,
      wins: 3,
    },
    attention: [],
    team: {} as AdminCommandCenterData['team'],
    rows: [],
    pipeline: [],
    stuck: [],
    profiles: [],
    activity: [],
    scopeNote: 'organization',
    ...overrides,
  }
}

describe('ADMIN_V3_CREATE_PROSPECT_VISIBLE', () => {
  it('keeps Analyze Prospect as the primary admin action', () => {
    const actions = buildAdminV3QuickActions(false)
    expect(actions[0]).toMatchObject({ label: 'Analyze prospect', href: '/prospect' })
    expect(actions.some((a) => a.label === 'Invite person')).toBe(true)
  })
})

describe('ADMIN_V3_ATTENTION_POLICY', () => {
  it('uses the canonical attention policy and caps at six', () => {
    const signals = Array.from({ length: 9 }, (_, i) =>
      signal({ repId: `rep-${i}`, repName: `Rep ${i}`, severity: i < 2 ? 'critical' : 'attention' }),
    )
    const rows = buildAdminV3Attention(signals)
    expect(rows).toHaveLength(6)
    expect(rows.filter((r) => r.severity === 'critical')).toHaveLength(2)
    expect(rows[0].ctaLabel).toBe('Open replies')
  })

  it('maps each category to a concrete intervention', () => {
    const categories = ['FOLLOWUPS_OVERDUE', 'HIGH_PRIORITY_UNTOUCHED', 'TASKS_OVERDUE', 'NO_PROFILE_ASSIGNMENT'] as const
    const labels = categories.map((category) =>
      buildAdminV3Attention([signal({ category })])[0].ctaLabel,
    )
    expect(labels).toEqual(['View follow-ups', 'Review opportunities', 'Review tasks', 'Resolve'])
  })
})

describe('ADMIN_V3_TEAM_ROW', () => {
  it('makes the person dominant and keeps operational stats', () => {
    const [row] = buildAdminV3TeamRows([teamRow()])
    expect(row.name).toBe('Mehak Seedat')
    expect(row.role).toBe('Mehak LinkedIn')
    expect(row.status).toBe('Attention')
    expect(row.href).toBe('/team/rep-1')
    expect(row.stats.slice(0, 5)).toEqual([
      { label: 'Done', value: 12 },
      { label: 'Replies', value: 4 },
      { label: 'Follow-ups', value: 1 },
      { label: 'Priority', value: 3 },
      { label: 'Meetings', value: 2 },
    ])
  })
})

describe('ADMIN_V3_PIPELINE', () => {
  it('maps the canonical funnel stages without inventing a chart', () => {
    const pipeline = buildAdminV3Pipeline(
      (
        [
          ['qualified', 'Qualified', 58, 100],
          ['contacted', 'Contacted', 31, 53],
          ['conversation', 'Conversation', 19, 61],
          ['meeting', 'Meeting', 7, 37],
          ['proposal', 'Proposal', 4, 57],
          ['won', 'Won', 3, 75],
        ] as const
      ).map(([key, label, count, conversionPct]) => ({
        key,
        label,
        count,
        conversionPct,
        stalledCount: 0,
        href: '/leads',
      })),
    )
    expect(pipeline).toHaveLength(6)
    expect(pipeline[0]).toMatchObject({ label: 'Qualified', count: 58, conversionPct: 100 })
  })
})

describe('ADMIN_V3_ACTIVITY', () => {
  it('shows only meaningful events, capped at five', () => {
    const rows = Array.from({ length: 8 }, (_, i) => activity({ id: `ae:${i}` }))
    expect(buildAdminV3Activity(rows)).toHaveLength(5)
  })

  it('sanitizes failures instead of leaking them', () => {
    expect(sanitizeAdminV3Error(new Error('relation "x" does not exist'))).not.toContain('relation')
  })
})

describe('ADMIN_V3_OWNER_LINKS', () => {
  it('adds owner-only destinations on top of the shared actions', () => {
    const ownerOnly = buildAdminV3QuickActions(true).filter((a) => a.ownerOnly)
    expect(ownerOnly.map((a) => a.label)).toEqual(['People & Roles', 'Profiles & identities', 'Targets', 'AI usage'])
    expect(buildAdminV3QuickActions(false).some((a) => a.ownerOnly)).toBe(false)
  })
})

describe('ADMIN_V3_ORG_SCOPE', () => {
  it('reads organization-wide health metrics', () => {
    const metrics = buildAdminV3Health(data())
    expect(metrics).toHaveLength(5)
    expect(metrics[0]).toMatchObject({ label: 'Active opportunities', value: 128, href: '/leads' })
    expect(metrics[2].value).toBe(3)
    expect(data().scopeNote).toBe('organization')
  })
})
