import { describe, expect, it } from 'vitest'
import type { RelayTodayAction } from '@/lib/tasks/relay-today-action'
import {
  actionDeepLink,
  classifyWorkTab,
  humanWhyNow,
  isHighPriorityOpportunity,
  overdueSeverity,
  primaryCtaLabel,
} from '@/lib/rep-home/action-presentation'
import { deriveTodayCounts } from '@/lib/relay/today-counts'
import { filterActionsByWorkspace } from '@/lib/rep-home/profile-scope'
import type { Lead } from '@/lib/domain/types'

function action(partial: Partial<RelayTodayAction> & Pick<RelayTodayAction, 'id' | 'kind'>): RelayTodayAction {
  return {
    priority: 'high',
    title: 'Acme',
    subtitle: 'Jane Doe',
    href: `/leads/${partial.id}`,
    whatHappened: '',
    whyItMatters: '',
    whyLines: [],
    prepared: null,
    humanAction: 'REPLY_NOW',
    createdAt: new Date().toISOString(),
    fitScore: null,
    identity: null,
    proof: null,
    inbound: false,
    ...partial,
  }
}

describe('REP_HOME metrics', () => {
  it('REP_HOME_METRICS: deriveTodayCounts matches reply and follow-up kinds', () => {
    const actions = [
      action({ id: 'a', kind: 'reply_needed' }),
      action({ id: 'b', kind: 'followup_due' }),
      action({ id: 'c', kind: 'high_fit_lead' }),
    ]
    expect(deriveTodayCounts(actions)).toEqual({ repliesWaiting: 1, followUpsDue: 1 })
  })
})

describe('REP_HOME do this next', () => {
  it('REP_HOME_DO_THIS_NEXT: reply links to conversation tab', () => {
    const a = action({ id: 'lead-1', kind: 'reply_needed', humanAction: 'REPLY_NOW' })
    expect(actionDeepLink(a)).toBe('/leads/lead-1?tab=conversation')
  })

  it('REP_HOME_ONE_PRIMARY_CTA: primary label is singular verb', () => {
    expect(primaryCtaLabel(action({ id: 'x', kind: 'followup_due', humanAction: 'SEND_FOLLOWUP' }))).toBe('Follow up')
  })
})

describe('REP_HOME profile scope', () => {
  it('REP_HOME_PROFILE_SCOPE: filters actions to workspace-stamped leads', () => {
    const leads = new Map<string, Lead>([
      ['a', { id: 'a', company: 'A', revenueIdentityId: 'id-1' } as Lead],
      ['b', { id: 'b', company: 'B', revenueIdentityId: 'id-2' } as Lead],
    ])
    const actions = [
      action({ id: 'a', kind: 'reply_needed' }),
      action({ id: 'b', kind: 'reply_needed' }),
    ]
    const scoped = filterActionsByWorkspace(actions, leads, {
      id: 'id-1',
      identityName: 'Mehak',
      title: null,
      channel: 'linkedin',
      profileId: null,
    })
    expect(scoped).toHaveLength(1)
    expect(scoped[0].id).toBe('a')
  })
})

describe('REP_HOME task semantics', () => {
  it('REP_HOME_HIGH_PRIORITY: excludes replies and follow-ups', () => {
    expect(isHighPriorityOpportunity(action({ id: '1', kind: 'reply_needed' }))).toBe(false)
    expect(isHighPriorityOpportunity(action({ id: '2', kind: 'high_fit_lead', priority: 'high' }))).toBe(true)
  })

  it('REP_HOME_FOLLOWUP_TASK: overdue severity buckets', () => {
    const now = Date.parse('2026-10-31T12:00:00Z')
    expect(overdueSeverity('2026-10-31T10:00:00Z', now)).toBe('mild')
    expect(overdueSeverity('2026-10-30T12:00:00Z', now)).toBe('attention')
    expect(overdueSeverity('2026-10-28T12:00:00Z', now)).toBe('critical')
  })

  it('REP_HOME_REPLY_TASK: human why now avoids raw enums', () => {
    const a = action({
      id: 'z',
      kind: 'reply_needed',
      whatHappened: 'Positive commercial reply from buyer',
    })
    expect(humanWhyNow(a)).toBe('Positive commercial reply')
  })
})

describe('REP_HOME work tabs', () => {
  it('REP_HOME_WORK_TABS: classifies overdue vs today', () => {
    const past = new Date(Date.now() - 5 * 3_600_000).toISOString()
    expect(classifyWorkTab(action({ id: 'o', kind: 'followup_due', createdAt: past }))).toBe('overdue')
    expect(classifyWorkTab(action({ id: 't', kind: 'reply_needed', priority: 'urgent' }))).toBe('today')
  })

  it('REP_HOME_EMPTY_STATE: zero actions yields empty counts', () => {
    expect(deriveTodayCounts([])).toEqual({ repliesWaiting: 0, followUpsDue: 0 })
  })
})
