/** Rep Home V3 product contracts. */
import { describe, expect, it } from 'vitest'
import {
  buildRepV3Actions,
  buildRepV3Activity,
  buildRepV3Metrics,
  buildRepV3ProfileMeta,
  buildRepV3Stages,
  countRepV3DueToday,
  deriveRepV3MetricInput,
  REP_V3_ACTION_LIMIT,
  REP_V3_EMPTY_STATE,
  REP_V3_PRIMARY_CTA,
  REP_V3_PROFILE_LABEL,
  REP_V3_SECTION_ERROR,
  sanitizeRepV3Error,
  selectRepV3WorkRows,
} from '@/lib/rep-home/v3-present'
import { filterActionsByWorkspace, sliceTargetSummaryForWorkspace } from '@/lib/rep-home/profile-scope'
import type { RelayTodayAction } from '@/components/relay-today-workspace'
import type { UnifiedTask } from '@/lib/tasks/types'
import type { OpenLeadFact } from '@/lib/team/admin-command-summary'
import type { TimelineRow } from '@/lib/operations/activity'

const NOW = Date.parse('2026-11-02T15:00:00Z')

function action(overrides: Partial<RelayTodayAction> = {}): RelayTodayAction {
  return {
    id: 'lead-1',
    kind: 'reply_needed',
    priority: 'high',
    title: 'Reply to Sarah Chen',
    subtitle: 'Acme',
    href: '/leads/lead-1',
    whatHappened: 'Asked about pricing',
    whyItMatters: 'Asked about pricing',
    whyLines: ['Asked about pricing'],
    prepared: null,
    humanAction: 'REPLY_NOW',
    createdAt: new Date(NOW - 42 * 60_000).toISOString(),
    fitScore: null,
    identity: { id: null, name: 'Mehak LinkedIn', title: 'Senior Software Engineer', channel: 'linkedin' },
    proof: null,
    inbound: false,
    ...overrides,
  }
}

function unified(overrides: Partial<UnifiedTask> = {}): UnifiedTask {
  return {
    id: 'task-1',
    source: 'DERIVED',
    kind: 'REPLY',
    title: 'Reply to Sarah Chen',
    reason: 'Asked about pricing',
    organizationId: 'org',
    assigneeRepId: 'rep-1',
    companyName: 'Acme',
    profileName: 'Mehak LinkedIn',
    priority: 'HIGH',
    status: 'OPEN',
    createdAt: new Date(NOW - 42 * 60_000).toISOString(),
    action: { label: 'Reply', href: '/leads/lead-1?tab=conversation' },
    ...overrides,
  }
}

function lead(status: OpenLeadFact['status'], id: string): OpenLeadFact {
  return {
    id,
    company: `Company ${id}`,
    status,
    ownerRepId: 'rep-1',
    ownerName: 'Mehak',
    revenueIdentityId: 'identity-1',
    canonicalScore: 80,
    updatedAt: new Date(NOW - 86_400_000).toISOString(),
    lastOutboundAt: null,
  }
}

function timeline(overrides: Partial<TimelineRow> = {}): TimelineRow {
  return {
    id: 'ae:1',
    at: new Date(NOW - 3_600_000).toISOString(),
    actorRepId: 'rep-1',
    actorName: 'Mehak',
    profileName: 'Mehak LinkedIn',
    leadId: 'lead-1',
    leadLabel: 'Sarah Chen',
    company: 'Acme',
    companyKey: 'acme',
    event: 'Reply sent',
    category: 'conversation',
    result: 'Sent',
    href: '/leads/lead-1',
    source: null,
    ...overrides,
  }
}

describe('REP_V3_CREATE_PROSPECT_VISIBLE', () => {
  it('keeps Analyze Prospect as the persistent primary action', () => {
    expect(REP_V3_PRIMARY_CTA).toEqual({ label: 'Analyze Prospect', href: '/prospect' })
    expect(REP_V3_EMPTY_STATE.cta).toBe('Analyze a prospect')
  })
})

describe('REP_V3_PROFILE_VISIBLE', () => {
  it('always renders the active sending identity', () => {
    expect(REP_V3_PROFILE_LABEL).toBe('Working as')
    expect(buildRepV3ProfileMeta({ identityName: 'Mehak LinkedIn', title: 'Senior Software Engineer' })).toBe(
      'Mehak LinkedIn · Senior Software Engineer',
    )
    expect(buildRepV3ProfileMeta(null)).toBeNull()
  })
})

describe('REP_V3_ACTION_LIMIT', () => {
  it('caps Do this next at five rows', () => {
    const tasks = Array.from({ length: 9 }, (_, i) => unified({ id: `t-${i}`, title: `Task ${i}` }))
    expect(buildRepV3Actions(tasks, [])).toHaveLength(REP_V3_ACTION_LIMIT)
    expect(buildRepV3Actions(tasks, [])).toHaveLength(5)
  })
})

describe('REP_V3_CANONICAL_ACTIONS', () => {
  it('prefers the task engine and maps canonical priorities and CTAs', () => {
    const rows = buildRepV3Actions([unified({ priority: 'CRITICAL' })], [action()])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      priority: 'critical',
      ctaLabel: 'Reply',
      href: '/leads/lead-1?tab=conversation',
      context: 'Acme · Mehak LinkedIn',
    })
  })

  it('falls back to ranked actions when no unified tasks exist', () => {
    const rows = buildRepV3Actions([], [action({ priority: 'urgent', kind: 'followup_due', humanAction: 'SEND_FOLLOWUP' })])
    expect(rows[0].priority).toBe('critical')
    expect(rows[0].ctaLabel).toBe('Follow up')
  })
})

describe('REP_V3_METRICS', () => {
  it('shows exactly four restrained tiles', () => {
    const metrics = buildRepV3Metrics(
      deriveRepV3MetricInput({
        ranked: [
          action({ kind: 'reply_needed', priority: 'urgent', createdAt: new Date(NOW - 5 * 3_600_000).toISOString() }),
          action({ id: 'l2', kind: 'followup_due', priority: 'medium', createdAt: new Date(NOW + 2 * 3_600_000).toISOString() }),
        ],
        openTasks: 5,
        tasksDueToday: 2,
        now: NOW,
      }),
    )
    expect(metrics.map((m) => m.key)).toEqual(['needsAction', 'replies', 'followups', 'tasks'])
    expect(metrics[1].hint).toBe('1 older than 4h')
    expect(metrics[2].hint).toBe('Due today')
    expect(metrics[3].value).toBe(5)
  })

  it('flags overdue follow-ups', () => {
    const input = deriveRepV3MetricInput({
      ranked: [action({ kind: 'followup_due', createdAt: new Date(NOW - 48 * 3_600_000).toISOString() })],
      openTasks: 0,
      tasksDueToday: 0,
      now: NOW,
    })
    expect(input.followUpsOverdue).toBe(1)
  })
})

describe('REP_V3_PIPELINE_LINKS', () => {
  it('uses the canonical funnel and stays at five stages', () => {
    const stages = buildRepV3Stages([
      lead('new', 'a'),
      lead('contacted', 'b'),
      lead('replied', 'c'),
      lead('won', 'd'),
    ])
    expect(stages).toHaveLength(5)
    expect(stages[0]).toMatchObject({ key: 'qualified', count: 1, href: '/leads?filter=new' })
    expect(stages.map((s) => s.href).every((href) => href.startsWith('/leads'))).toBe(true)
  })
})

describe('REP_V3_EMPTY_STATE', () => {
  it('never renders a blank panel when nothing needs attention', () => {
    expect(selectRepV3WorkRows('replies', [], [])).toHaveLength(0)
    expect(REP_V3_EMPTY_STATE.body).toMatch(/No replies, follow-ups or tasks/)
  })
})

describe('REP_V3_ERROR_SANITIZATION', () => {
  it('never leaks driver internals to the rep', () => {
    const raw = '((e.at ?? "").localeCompare is not a function)'
    const safe = sanitizeRepV3Error(new TypeError(raw))
    expect(safe).toBe(REP_V3_SECTION_ERROR)
    expect(safe).not.toContain('localeCompare')
  })
})

describe('REP_V3_PROFILE_SWITCH_SCOPE', () => {
  it('drops actions for leads outside the active workspace', () => {
    const inWorkspace = action({ id: 'reply-lead-a', href: '/leads/lead-a' })
    const outOfWorkspace = action({ id: 'reply-lead-b', href: '/leads/lead-b' })
    const leadsById = new Map([
      ['lead-a', { revenueIdentityId: 'identity-1' }],
      ['lead-b', { revenueIdentityId: 'identity-2' }],
    ]) as never
    const filtered = filterActionsByWorkspace([inWorkspace, outOfWorkspace] as never, leadsById, {
      id: 'identity-1',
    } as never)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('reply-lead-a')
  })

  it('scopes target summaries to the active identity only', () => {
    const scoped = sliceTargetSummaryForWorkspace(
      [
        { revenueIdentityId: 'identity-1', identityName: 'A', targets: [] },
        { revenueIdentityId: 'identity-2', identityName: 'B', targets: [] },
      ] as never,
      { id: 'identity-1' } as never,
    )
    expect(scoped).toHaveLength(1)
    expect(scoped[0].identityName).toBe('A')
  })
})

describe('rep activity', () => {
  it('caps recent events at five and keeps lead context', () => {
    const rows = Array.from({ length: 7 }, (_, i) => timeline({ id: `ae:${i}`, leadLabel: `Lead ${i}` }))
    expect(buildRepV3Activity(rows)).toHaveLength(5)
    expect(buildRepV3Activity(rows)[0].label).toContain('Lead 0')
  })

  it('counts tasks due inside the day window only', () => {
    const due = unified({ id: 'due', dueAt: new Date(NOW + 2 * 3_600_000).toISOString() })
    const far = unified({ id: 'far', dueAt: new Date(NOW + 96 * 3_600_000).toISOString() })
    expect(countRepV3DueToday([due, far], NOW)).toBe(1)
  })
})
