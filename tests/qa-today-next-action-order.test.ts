/**
 * TODAY_NEXT_ACTION_ORDER
 *
 * The product contract for the "Do this next" list:
 *   - a waiting buyer reply always outranks cold work
 *   - a due follow-up on a live thread outranks fresh prospecting
 *   - otherwise the existing priority score decides
 *
 * This exercises the real `rankNextActions`, not a copy of its rules.
 */
import { describe, expect, it } from 'vitest'
import { rankNextActions } from '@/lib/relay/next-best-action'
import type { RelayQueue, RelayTask, RelayTaskKind } from '@/lib/domain/types'

function task(kind: RelayTaskKind, entityId: string, priorityScore: number): RelayTask {
  return {
    id: `task-${entityId}`,
    kind,
    priority: priorityScore >= 90 ? 'urgent' : priorityScore >= 70 ? 'high' : 'medium',
    priorityScore,
    title: `${kind} ${entityId}`,
    subtitle: '',
    entityType: 'lead',
    entityId,
    whatHappened: '',
    whyItMatters: '',
    recommendation: {
      action: 'review',
      preparedOutput: null,
      evidence: [],
      confidence: 0.8,
      forbidsImpersonation: true,
    },
    humanAction: 'review',
    stale: false,
    stalenessNote: null,
    createdAt: '2026-10-30T04:00:00.000Z',
  }
}

function rank(tasks: RelayTask[]) {
  const queue = { tasks } as unknown as RelayQueue
  return rankNextActions({ queue, leads: [], messagesByLead: new Map() })
}

describe('TODAY_NEXT_ACTION_ORDER', () => {
  it('puts a waiting reply above a higher-scored cold prospect', () => {
    const actions = rank([
      task('high_fit_lead', 'cold-1', 99),
      task('reply_needed', 'reply-1', 40),
    ])

    expect(actions[0].action).toBe('REPLY_NOW')
    expect(actions[0].leadId).toBe('reply-1')
    expect(actions[1].action).toBe('RESEARCH')
  })

  it('puts a due follow-up above fresh prospecting', () => {
    const actions = rank([
      task('high_fit_lead', 'cold-1', 95),
      task('followup_due', 'follow-1', 55),
    ])

    expect(actions[0].action).toBe('SEND_FOLLOWUP')
    expect(actions[0].leadId).toBe('follow-1')
  })

  it('keeps replies above follow-ups', () => {
    const actions = rank([
      task('followup_due', 'follow-1', 90),
      task('reply_needed', 'reply-1', 10),
    ])

    expect(actions[0].action).toBe('REPLY_NOW')
    expect(actions[1].action).toBe('SEND_FOLLOWUP')
  })

  it('falls back to priority among comparable work', () => {
    const actions = rank([
      task('high_fit_lead', 'cold-low', 50),
      task('new_opportunity', 'cold-high', 90),
    ])

    expect(actions[0].leadId).toBe('cold-high')
  })

  it('does not duplicate a lead that appears twice', () => {
    const actions = rank([
      task('reply_needed', 'same-lead', 90),
      task('followup_due', 'same-lead', 80),
    ])

    expect(actions).toHaveLength(1)
    expect(actions[0].action).toBe('REPLY_NOW')
  })
})
