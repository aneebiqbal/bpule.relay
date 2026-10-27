/**
 * Inbound visibility contract (BUG-004 follow-up).
 *
 * An inbound lead with a canonical inbound message must remain operationally
 * visible even if no sender profile has been assigned yet. Today's queue must
 * build an `inbound_opportunity` task for it regardless of `allLeads` (the
 * dashboard passes an empty list) and regardless of sender assignment.
 *
 * Fixtures: inbound + no sender, inbound + assigned sender, outbound-only +
 * no sender, terminal inbound + no sender.
 */
import { describe, expect, it } from 'vitest'
import { buildRelayQueue } from '@/lib/relay/queue-engine'
import { deriveTodayCounts } from '@/lib/relay/today-counts'
import type { Lead } from '@/lib/domain/types'
import type { ConversationState } from '@/lib/relay/queue-engine'
import type { QueueData } from '@/lib/store/types'

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-inbound',
    organizationId: 'org-1',
    ownerRepId: 'rep-1',
    company: 'Inbound Co',
    companyKey: 'inboundco',
    contactName: 'Michael Anderson',
    contactTitle: 'CTO',
    url: null,
    rawInput: null,
    signalType: null,
    signalEvidence: null,
    verbatimQuote: null,
    score: null,
    verdict: null,
    status: 'new',
    playId: null,
    tags: [],
    direction: 'inbound',
    source: 'linkedin',
    inboundMessage: 'We need an external team to rebuild our booking platform.',
    senderProfileId: null,
    connectionAcceptedAt: null,
    lockedUntil: null,
    lockedReason: null,
    archived: false,
    archivedAt: null,
    createdAt: '2026-10-27T10:00:00Z',
    canonicalScore: 40,
    ...overrides,
  } as Lead
}

function queueData(leads: Lead[]): QueueData {
  return {
    todaySends: 0,
    dailyLimit: 20,
    queue: leads.filter((l) => l.status === 'new' || l.status === 'contacted'),
    replies: leads.filter((l) => l.status === 'replied'),
  } as QueueData
}

function build(leads: Lead[], conversations = new Map<string, ConversationState>()) {
  return buildRelayQueue({
    roleContext: { role: 'MEMBER', repId: 'rep-1', repName: 'Rep', organizationId: 'org-1', organizationName: 'Org' } as never,
    queueData: queueData(leads),
    followupsDue: [],
    upwork: { queue: [], todayApplies: 0 } as never,
    conversations,
    messagesByLead: new Map(),
    messagesByJob: new Map(),
    assignedProfiles: [],
    allLeads: [],
  })
}

function inboundTasks(queue: ReturnType<typeof buildRelayQueue>) {
  return queue.tasks.filter((t) => t.kind === 'inbound_opportunity')
}

describe('inbound visibility contract', () => {
  it('an inbound lead with no sender assignment still gets a Today task', () => {
    const queue = build([lead()])
    const tasks = inboundTasks(queue)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].entityId).toBe('lead-inbound')
  })

  it('an inbound lead with an assigned sender gets exactly one task (no duplicate)', () => {
    const conversations = new Map<string, ConversationState>([
      ['lead-inbound', { leadId: 'lead-inbound', senderProfileId: 'sender-1' } as ConversationState],
    ])
    const queue = build([lead({ senderProfileId: 'sender-1' })], conversations)
    expect(inboundTasks(queue)).toHaveLength(1)
  })

  it('an outbound-only lead is not an inbound opportunity', () => {
    const queue = build([lead({ direction: 'outbound', inboundMessage: null })])
    expect(inboundTasks(queue)).toHaveLength(0)
  })

  it('a terminal inbound lead is not an inbound opportunity', () => {
    const queue = build([lead({ status: 'won' })])
    expect(inboundTasks(queue)).toHaveLength(0)
  })

  it('allLeads and the owned queue never produce the same inbound task twice', () => {
    const l = lead()
    const queue = buildRelayQueue({
      roleContext: { role: 'MEMBER', repId: 'rep-1', repName: 'Rep', organizationId: 'org-1', organizationName: 'Org' } as never,
      queueData: queueData([l]),
      followupsDue: [],
      upwork: { queue: [], todayApplies: 0 } as never,
      conversations: new Map(),
      messagesByLead: new Map(),
      messagesByJob: new Map(),
      assignedProfiles: [],
      allLeads: [l],
    })
    expect(inboundTasks(queue)).toHaveLength(1)
  })

  it('an inbound opportunity counts as a reply waiting in the Today KPI', () => {
    const counts = deriveTodayCounts([{ kind: 'inbound_opportunity' }, { kind: 'reply_needed' }])
    expect(counts.repliesWaiting).toBe(2)
  })
})
