/**
 * SUPPRESSION — one authority, no surface bypass.
 *
 * A lead carrying an active suppression row must receive no outreach task of any
 * kind from Today: not a cold task, not a follow-up, not a reply. Suppression is
 * not a send-time check that Today may skip.
 */
import { describe, expect, it } from 'vitest'
import { buildRelayQueue } from '@/lib/relay/queue-engine'
import type { Lead } from '@/lib/domain/types'
import type { ConversationState, QueueData } from '@/lib/domain/types'

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    organizationId: 'org-1',
    ownerRepId: 'rep-1',
    company: 'Acme',
    companyKey: 'acme',
    contactName: 'Sara',
    contactTitle: 'CTO',
    url: null,
    rawInput: null,
    signalType: null,
    signalEvidence: null,
    verbatimQuote: null,
    score: null,
    verdict: 'send',
    status: 'new',
    playId: null,
    tags: [],
    direction: 'outbound',
    source: 'linkedin',
    inboundMessage: null,
    senderProfileId: null,
    connectionAcceptedAt: null,
    lockedUntil: null,
    lockedReason: null,
    archived: false,
    archivedAt: null,
    createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    canonicalScore: 80,
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

function build(leads: Lead[], suppressedLeadIds?: ReadonlySet<string>) {
  return buildRelayQueue({
    roleContext: { role: 'MEMBER', repId: 'rep-1', repName: 'Rep', organizationId: 'org-1', organizationName: 'Org' } as never,
    queueData: queueData(leads),
    followupsDue: [],
    upwork: { queue: [], todayApplies: 0 } as never,
    conversations: new Map<string, ConversationState>(),
    messagesByLead: new Map(),
    messagesByJob: new Map(),
    assignedProfiles: [],
    allLeads: [],
    ...(suppressedLeadIds ? { suppressedLeadIds } : {}),
  })
}

describe('SUPPRESSION — no outreach task for a suppressed lead', () => {
  it('builds a cold task for a qualified lead that is not suppressed', () => {
    const queue = build([lead()])
    expect(queue.tasks.some((t) => t.entityId === 'lead-1')).toBe(true)
  })

  it('builds no task of any kind for a suppressed lead', () => {
    const queue = build([lead()], new Set(['lead-1']))
    expect(queue.tasks.filter((t) => t.entityId === 'lead-1')).toEqual([])
  })

  it('suppresses only the suppressed lead', () => {
    const queue = build([lead({ id: 'lead-1' }), lead({ id: 'lead-2', company: 'Beta', companyKey: 'beta' })], new Set(['lead-1']))
    const ids = queue.tasks.map((t) => t.entityId)

    expect(ids).not.toContain('lead-1')
    expect(ids).toContain('lead-2')
  })

  it('suppresses a follow-up on a contacted lead', () => {
    const queue = build([lead({ id: 'lead-1', status: 'contacted' })], new Set(['lead-1']))
    expect(queue.tasks.filter((t) => t.entityId === 'lead-1')).toEqual([])
  })

  it('suppresses a reply task for a lead that has already replied', () => {
    const queue = build([lead({ id: 'lead-1', status: 'replied' })], new Set(['lead-1']))
    expect(queue.tasks.filter((t) => t.entityId === 'lead-1')).toEqual([])
  })

  it('is unchanged when no suppression set is supplied', () => {
    const without = build([lead()])
    const withEmpty = build([lead()], new Set())

    expect(withEmpty.tasks.map((t) => t.entityId)).toEqual(without.tasks.map((t) => t.entityId))
  })
})
