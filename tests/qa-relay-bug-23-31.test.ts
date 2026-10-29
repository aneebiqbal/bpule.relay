/**
 * BUG-23 … BUG-31 regression guards.
 *
 * Each block is named after the fixture in docs/RELAY_BUG_23_31_CLOSURE.md.
 * These assert the CONTRACT, not the implementation: if a future change makes a
 * score-4 lead stop progressing, or lets a follow-up exist with no outbound
 * message, the test must fail even if the UI still looks plausible.
 *
 * Browser-level proof (Prospect reset, Save-draft confirmation) lives in
 * tests/qa-relay-bug-23-31-e2e.spec.ts.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { deriveNextLeadAction } from '@/lib/relay/lead-state-machine'
import { evaluateFollowUpPolicy, MAX_FOLLOWUPS_PER_LEAD } from '@/lib/conversation/follow-up-policy'
import { leadBelongsToWorkspace, type WorkspaceIdentity } from '@/lib/workspace/active-identity'
import { scopeLeadsToWorkspace } from '@/lib/leads/board-rows'
import {
  PROSPECT_DRAFT_KEY,
  isProspectDraftWorthSaving,
  readProspectDraft,
  serializeProspectDraft,
} from '@/lib/prospect/draft'
import { emitAction } from '@/lib/action-ledger'
import type { LeadDetail } from '@/lib/store/types'
import type { Message } from '@/lib/domain/types'

const DAY = 1000 * 60 * 60 * 24
const NOW = new Date('2026-10-29T12:00:00Z')

function lead(overrides: Partial<LeadDetail> = {}): LeadDetail {
  return {
    id: 'lead-1',
    organizationId: 'org-1',
    company: 'Acme',
    companyKey: 'acme',
    contactName: 'Sam',
    status: 'contacted',
    direction: 'outbound',
    source: 'prospect',
    createdAt: '2026-10-01T00:00:00Z',
    messages: [],
    ...overrides,
  } as LeadDetail
}

function msg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    organizationId: 'org-1',
    leadId: 'lead-1',
    repId: null,
    type: 'connection',
    direction: 'outbound',
    sentText: 'Hi',
    sentAt: '2026-10-01T00:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
    ...overrides,
  } as Message
}

// ---------------------------------------------------------------------------
// BUG023 — the prospect draft must not survive a successful save
// ---------------------------------------------------------------------------
describe('BUG023_PROSPECT_RESET_AFTER_SAVE', () => {
  it('round-trips a draft so a refresh does not lose work in progress', () => {
    const stored = serializeProspectDraft({ rawInput: 'paste text', result: { score: { total: 8 } } })
    const parsed = readProspectDraft(stored)
    expect(parsed?.rawInput).toBe('paste text')
    expect(parsed?.result).toEqual({ score: { total: 8 } })
  })

  it('treats corrupt storage as no draft rather than throwing', () => {
    expect(readProspectDraft('not json')).toBeNull()
    expect(readProspectDraft(null)).toBeNull()
  })

  it('does not persist an empty draft, so a cleared key stays cleared', () => {
    // The save handler removes the key; the persist effect must not immediately
    // recreate it with nothing in it.
    expect(isProspectDraftWorthSaving({ rawInput: '', result: null })).toBe(false)
    expect(isProspectDraftWorthSaving({ rawInput: '   ', result: null })).toBe(false)
    expect(isProspectDraftWorthSaving({ rawInput: 'x', result: null })).toBe(true)
    expect(isProspectDraftWorthSaving({ rawInput: '', result: { score: 1 } })).toBe(true)
  })

  it('uses one stable key, so the restore effect and the clear cannot drift', () => {
    expect(PROSPECT_DRAFT_KEY).toBe('relay.prospect.draft.v1')
  })
})

// ---------------------------------------------------------------------------
// BUG024 / BUG030 — one canonical profile-attribution and visibility contract
// ---------------------------------------------------------------------------
const ANEEB: WorkspaceIdentity = { id: 'ident-aneeb', identityName: 'Aneeb', title: null, channel: 'linkedin', profileId: 'prof-aneeb' }
const MEHAK: WorkspaceIdentity = { id: 'ident-mehak', identityName: 'Mehak', title: null, channel: 'linkedin', profileId: 'prof-mehak' }

describe('BUG030_PROFILE_LEAD_ISOLATION', () => {
  const leadA = { id: 'a', revenueIdentityId: 'ident-aneeb', senderProfileId: 'prof-aneeb' }
  const leadB = { id: 'b', revenueIdentityId: 'ident-mehak', senderProfileId: 'prof-mehak' }

  it('assigns a stamped lead only to its own workspace', () => {
    expect(leadBelongsToWorkspace(leadA, ANEEB)).toBe(true)
    expect(leadBelongsToWorkspace(leadA, MEHAK)).toBe(false)
    expect(leadBelongsToWorkspace(leadB, MEHAK)).toBe(true)
    expect(leadBelongsToWorkspace(leadB, ANEEB)).toBe(false)
  })

  it('scopes the rep board so each profile sees only its own leads', () => {
    const scoped = scopeLeadsToWorkspace([leadA, leadB], ANEEB, false)
    expect(scoped.map((l) => l.id)).toEqual(['a'])
    expect(scopeLeadsToWorkspace([leadA, leadB], MEHAK, false).map((l) => l.id)).toEqual(['b'])
  })

  it('keeps the admin board org-wide — that surface is intentionally unscoped', () => {
    expect(scopeLeadsToWorkspace([leadA, leadB], ANEEB, true).map((l) => l.id)).toEqual(['a', 'b'])
  })

  it('keeps the whole book when no workspace is resolvable, rather than showing nothing', () => {
    expect(scopeLeadsToWorkspace([leadA, leadB], null, false).map((l) => l.id)).toEqual(['a', 'b'])
  })

  it('never moves a lead between workspaces because the sender changed', () => {
    // A recommendation or a sender switch must not change visibility.
    const switched = { ...leadA, senderProfileId: 'prof-mehak' }
    expect(leadBelongsToWorkspace(switched, ANEEB)).toBe(true)
    expect(leadBelongsToWorkspace(switched, MEHAK)).toBe(false)
  })
})

describe('BUG024_PROSPECT_PROFILE_ATTRIBUTION', () => {
  it('does not infer a workspace from the sender profile when the lead is stamped', () => {
    // A stamped workspace is the only visibility key.
    const stamped = { id: 'x', revenueIdentityId: 'ident-aneeb', senderProfileId: 'prof-mehak' }
    expect(leadBelongsToWorkspace(stamped, MEHAK)).toBe(false)
  })

  it('falls back to the sender profile only for leads captured before workspace stamping', () => {
    const legacy = { id: 'y', revenueIdentityId: null, senderProfileId: 'prof-aneeb' }
    expect(leadBelongsToWorkspace(legacy, ANEEB)).toBe(true)
    expect(leadBelongsToWorkspace(legacy, MEHAK)).toBe(false)
  })

  it('never attributes a lead with no sender at all', () => {
    const bare = { id: 'z', revenueIdentityId: null, senderProfileId: null }
    expect(leadBelongsToWorkspace(bare, ANEEB)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// BUG025 — the lead list must be complete and profile-scoped
// ---------------------------------------------------------------------------
describe('BUG025_COMPLETE_PROFILE_SCOPED_LEAD_LIST', () => {
  it('returns every lead for the scoped workspace, with no truncation', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      id: `l${i}`,
      revenueIdentityId: i % 2 === 0 ? 'ident-aneeb' : 'ident-mehak',
      senderProfileId: null,
    }))
    const scoped = scopeLeadsToWorkspace(many, ANEEB, false)
    expect(scoped).toHaveLength(125)
    expect(new Set(scoped.map((l) => l.id)).size).toBe(125)
  })

  it('counts what it shows — the header total and the rendered set agree', () => {
    const scoped = scopeLeadsToWorkspace([
      { id: 'a', revenueIdentityId: 'ident-aneeb', senderProfileId: null },
      { id: 'b', revenueIdentityId: 'ident-mehak', senderProfileId: null },
    ], ANEEB, false)
    expect(scoped).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// BUG026 — no follow-up without a real outbound message
// ---------------------------------------------------------------------------
describe('BUG026_NO_FOLLOWUP_WITHOUT_OUTBOUND', () => {
  it('is never eligible with no outbound message, however old the lead is', () => {
    const createdDaysAgo = 10
    const policy = evaluateFollowUpPolicy({
      leadStatus: 'new',
      lastOutboundAt: null,
      lastInboundAt: null,
      followupCount: 0,
      channel: 'dm',
      now: new Date(NOW.getTime() + createdDaysAgo * DAY),
    })
    expect(policy.eligible).toBe(false)
    expect(policy.reason).toMatch(/no outbound/i)
  })

  it('is not eligible for a generated-but-unsent draft', () => {
    // A draft has no sent_at, so it must not start the clock.
    const policy = evaluateFollowUpPolicy({
      leadStatus: 'contacted',
      lastOutboundAt: null,
      lastInboundAt: null,
      followupCount: 0,
      channel: 'dm',
      now: NOW,
    })
    expect(policy.eligible).toBe(false)
  })

  it('becomes eligible only after the cadence elapses since a real send', () => {
    // Cadence is 3 calendar days after the first send (FOLLOW_UP_DUE_CALENDAR_DAYS[0]).
    const early = evaluateFollowUpPolicy({
      leadStatus: 'contacted',
      lastOutboundAt: new Date(NOW.getTime() - 2 * DAY).toISOString(),
      lastInboundAt: null,
      followupCount: 0,
      channel: 'dm',
      now: NOW,
    })
    expect(early.eligible).toBe(false)

    const due = evaluateFollowUpPolicy({
      leadStatus: 'contacted',
      lastOutboundAt: new Date(NOW.getTime() - 4 * DAY).toISOString(),
      lastInboundAt: null,
      followupCount: 0,
      channel: 'dm',
      now: NOW,
    })
    expect(due.eligible).toBe(true)
  })

  it('is cancelled by an inbound reply that came after our last send', () => {
    const sentAt = new Date(NOW.getTime() - 10 * DAY).toISOString()
    const replyAt = new Date(NOW.getTime() - 2 * DAY).toISOString()
    const policy = evaluateFollowUpPolicy({
      leadStatus: 'contacted', lastOutboundAt: sentAt, lastInboundAt: replyAt, followupCount: 0, channel: 'dm', now: NOW,
    })
    expect(policy.eligible).toBe(false)
    expect(policy.cancelledByReply).toBe(true)
  })

  it('is never eligible for a terminal lead', () => {
    const policy = evaluateFollowUpPolicy({
      leadStatus: 'won', lastOutboundAt: new Date(NOW.getTime() - 30 * DAY).toISOString(),
      lastInboundAt: null, followupCount: 0, channel: 'dm', now: NOW,
    })
    expect(policy.eligible).toBe(false)
    expect(policy.terminal).toBe(true)
  })

  it('stops at the canonical cap', () => {
    const policy = evaluateFollowUpPolicy({
      leadStatus: 'contacted', lastOutboundAt: new Date(NOW.getTime() - 30 * DAY).toISOString(),
      lastInboundAt: null, followupCount: MAX_FOLLOWUPS_PER_LEAD, channel: 'dm', now: NOW,
    })
    expect(policy.eligible).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// BUG027 — score decides priority, never whether a relationship may progress
// ---------------------------------------------------------------------------
describe('BUG027_STAGE_PROGRESS_INDEPENDENT_OF_SCORE', () => {
  // A connection that was actually sent and then accepted — the state a rep
  // reaches before the first DM. `connectionAcceptedAt` alone is not enough for
  // the state machine: it also requires the connection message to exist.
  const acceptedConnection = lead({
    status: 'contacted',
    connectionAcceptedAt: '2026-10-20T00:00:00Z',
    messages: [msg({ type: 'connection', sentAt: '2026-10-20T00:00:00Z' })],
  })

  it('lets a research_more (score 4/5) lead advance once a connection is accepted', () => {
    // Before the fix this returned REVIEW "Watch — not yet a fit" forever, so a
    // score-4 lead with an accepted connection could never send the first DM.
    const result = deriveNextLeadAction(
      lead({ ...acceptedConnection, verdict: 'research_more' }),
      NOW.getTime(),
    )
    expect(result.action).toBe('SEND_DM')
    expect(result.requiresAction).toBe(true)
  })

  it('progresses identically for score 4, 5 and 6 once the connection is accepted', () => {
    const actions = ['research_more', 'research_more', 'send'].map((verdict) =>
      deriveNextLeadAction(lead({ ...acceptedConnection, verdict }), NOW.getTime()).action,
    )
    expect(new Set(actions).size).toBe(1)
    expect(actions[0]).toBe('SEND_DM')
  })

  it('still watches a research_more lead that has no relationship at all', () => {
    const result = deriveNextLeadAction(lead({ verdict: 'research_more', status: 'new' }), NOW.getTime())
    expect(result.action).toBe('REVIEW')
    expect(result.requiresAction).toBe(false)
  })

  it('never contacts a skipped lead, at any score', () => {
    for (const status of ['new', 'contacted'] as const) {
      const result = deriveNextLeadAction(lead({ verdict: 'skip', status }), NOW.getTime())
      expect(result.action).not.toBe('SEND_CONNECTION')
      expect(result.action).not.toBe('SEND_DM')
    }
  })

  it('moves to needs-reply when the client answers, regardless of score band', () => {
    for (const verdict of ['skip', 'research_more', 'send']) {
      const result = deriveNextLeadAction(
        lead({
          verdict,
          status: 'replied',
          connectionAcceptedAt: '2026-10-20T00:00:00Z',
          messages: [msg({ type: 'dm', sentAt: '2026-10-20T00:00:00Z' }), msg({ id: 'm2', type: 'dm', direction: 'inbound', sentAt: '2026-10-28T00:00:00Z' })],
        }),
        NOW.getTime(),
      )
      // SKIP is a hard "do not contact" and stays closed; the two relationship
      // bands both move to the client's reply.
      if (verdict === 'skip') {
        expect(result.action).toBe('REVIEW')
      } else {
        expect(result.action).toBe('SEND_REPLY')
      }
    }
  })

  it('does not let a score band change the follow-up decision', () => {
    const sentAt = new Date(NOW.getTime() - 10 * DAY).toISOString()
    const actions = ['research_more', 'send'].map((verdict) =>
      deriveNextLeadAction(
        lead({ verdict, status: 'followed_up', messages: [msg({ type: 'followup', sentAt })] }),
        NOW.getTime(),
      ).action,
    )
    expect(new Set(actions).size).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// BUG028 / BUG029 — one action, one ledger row, one profile
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>

/**
 * A chainable stand-in for the supabase query builder that records every insert
 * payload. `select(...).eq(...).maybeSingle()` is the pre-check emitAction()
 * performs before inserting, so the chain has to be traversable, not a promise.
 *
 * Exactly-once is enforced by the database's unique index, not by this code, so
 * the unit test asserts the CONTRACT: the idempotency key and the sender profile
 * reach the row. The dedup itself is proven against the live database.
 */
function recordingLedgerClient() {
  const inserts: Row[] = []
  const from = vi.fn(() => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'is', 'not', 'order', 'limit', 'update']) {
      builder[method] = vi.fn(() => builder)
    }
    builder.eq = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    builder.single = vi.fn(() => Promise.resolve({ data: { id: `row-${inserts.length}` }, error: null }))
    builder.insert = vi.fn((payload: Row) => {
      inserts.push(payload)
      const inner: Record<string, unknown> = {}
      inner.select = vi.fn(() => inner)
      inner.single = vi.fn(() => Promise.resolve({ data: { id: `row-${inserts.length}` }, error: null }))
      inner.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
      return inner
    })
    return builder
  })
  return { inserts, from }
}

describe('BUG028_UPWORK_APPLIED_COUNTS_TODAY', () => {
  it('writes the idempotency key, so the database can collapse a retry into one row', async () => {
    const { inserts, from } = recordingLedgerClient()
    vi.resetModules()
    vi.doMock('@/lib/supabase/service', () => ({ createServiceSupabase: () => ({ from }) }))
    const { emitAction: emit } = await import('@/lib/action-ledger')

    await emit({
      orgId: 'org-1',
      actionType: 'UPWORK_APPLIED',
      actorId: 'rep-1',
      jobId: 'job-1',
      idempotencyKey: 'upwork_applied:job-1',
    })

    expect(inserts).toHaveLength(1)
    // Before the fix this was undefined: the upsert 400'd on the partial unique
    // index and the fallback inserted WITHOUT the key, so every event had a NULL
    // key and the exactly-once guarantee did not exist.
    expect(inserts[0].idempotency_key).toBe('upwork_applied:job-1')
    expect(inserts[0].action_type).toBe('UPWORK_APPLIED')
  })
})

describe('BUG029_ACTION_PROFILE_ATTRIBUTION', () => {
  it('persists the sender profile on the ledger row', async () => {
    const { inserts, from } = recordingLedgerClient()
    vi.resetModules()
    vi.doMock('@/lib/supabase/service', () => ({ createServiceSupabase: () => ({ from }) }))
    const { emitAction: emit } = await import('@/lib/action-ledger')

    await emit({
      orgId: 'org-1',
      actionType: 'UPWORK_APPLIED',
      actorId: 'rep-1',
      jobId: 'job-1',
      senderProfileId: 'prof-aneeb',
      idempotencyKey: 'upwork_applied:job-1',
    })

    expect(inserts[0].sender_profile_id).toBe('prof-aneeb')
    // Profile identity and the logged-in person are different concepts.
    expect(inserts[0].actor_id).toBe('rep-1')
  })

  it('leaves the profile null rather than inventing one when it is unknown', async () => {
    const { inserts, from } = recordingLedgerClient()
    vi.resetModules()
    vi.doMock('@/lib/supabase/service', () => ({ createServiceSupabase: () => ({ from }) }))
    const { emitAction: emit } = await import('@/lib/action-ledger')

    await emit({ orgId: 'org-1', actionType: 'UPWORK_APPLIED', jobId: 'job-1', idempotencyKey: 'k' })
    expect(inserts[0].sender_profile_id).toBeNull()
  })
})
