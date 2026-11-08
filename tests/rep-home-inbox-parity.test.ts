/**
 * REP HOME ↔ INBOX CANONICAL PARITY (P0).
 *
 * One concept has one canonical count and one canonical destination. Rep Home's
 * "replies waiting" and the Inbox's "Needs reply" are the same metric: the
 * canonical `waiting_on_rep` derivation over the rep's executable profiles
 * (primary + active coverage). These tests pin the scope, the predicate, the
 * count/destination contract, and the deep links.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  chatViewMatches,
  countChatViews,
  type ChatRow,
  type ChatView,
} from '@/lib/operations/chat-queue'
import { deriveConversationRow } from '@/lib/operations/conversations'
import { leadBelongsToAnyWorkspace } from '@/lib/workspace/active-identity'
import { getInboxCountsForRep } from '@/lib/operations/inbox-counts'
import { inboxViewHref, INBOX_PRIMARY_VIEWS } from '@/lib/navigation/inbox-nav'
import { createFakeSupabase } from './helpers/fake-supabase'

type FakeSupabase = ReturnType<typeof createFakeSupabase>

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const NOW = Date.parse('2026-11-08T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

function row(overrides: Partial<ChatRow> & { leadId: string }): ChatRow {
  return {
    person: 'Sarah Chen',
    company: 'Acme',
    companyKey: 'acme',
    ownerRepId: 'rep-1',
    ownerName: 'Dawood',
    profileName: 'Dawood LinkedIn',
    state: 'waiting_on_rep',
    stageLabel: 'replied',
    lastInboundAt: hoursAgo(2),
    lastOutboundAt: hoursAgo(20),
    waitingOn: 'Rep',
    ageHours: 2,
    nextAction: 'Reply',
    href: `/chats?lead=${overrides.leadId}`,
    title: 'VP Engineering',
    source: 'linkedin',
    profileId: 'id-1',
    clientIntent: null,
    preview: null,
    previewFrom: null,
    needsReview: false,
    unassigned: false,
    priority: 'normal',
    ...overrides,
  }
}

describe('REP_HOME_NEEDS_REPLY_INBOX_PARITY', () => {
  it('REP_HOME_NEEDS_REPLY_INBOX_PARITY: Rep Home reads the canonical Inbox count and links to waiting_me', () => {
    const home = read('src/components/v4/v4-rep-home.tsx')
    const dashboard = read('src/app/(app)/dashboard/page.tsx')
    // The card links to the exact canonical dataset, not a bare /chats.
    expect(home).toContain('/chats?view=waiting_me')
    expect(home).not.toContain('{data.day.repliesWaiting} waiting')
    // The dashboard derives the card from the canonical Inbox authority.
    expect(dashboard).toContain('getInboxCountsForRep')
    expect(dashboard).toContain('repliesWaiting: inboxCounts.needsReply')
  })
})

describe('REP_HOME_WAITING_ON_CLIENT_INBOX_PARITY', () => {
  it('REP_HOME_WAITING_ON_CLIENT_INBOX_PARITY: waiting_them is the canonical prospect/meeting state', () => {
    const rows = [
      row({ leadId: 'a', state: 'waiting_on_prospect' }),
      row({ leadId: 'b', state: 'meeting' }),
      row({ leadId: 'c', state: 'waiting_on_rep' }),
      row({ leadId: 'd', state: 'follow_up_due' }),
      row({ leadId: 'e', state: 'closed' }),
    ]
    const counts = countChatViews(rows, false)
    expect(counts.waiting_them).toBe(rows.filter((r) => chatViewMatches(r, 'waiting_them')).length)
    expect(counts.waiting_them).toBe(2)
  })
})

describe('REP_HOME_FOLLOWUP_INBOX_PARITY', () => {
  it('REP_HOME_FOLLOWUP_INBOX_PARITY: followups is the canonical due-follow-up state', () => {
    const rows = [
      row({ leadId: 'a', state: 'follow_up_due' }),
      row({ leadId: 'b', state: 'follow_up_due' }),
      row({ leadId: 'c', state: 'waiting_on_prospect' }),
      row({ leadId: 'd', state: 'waiting_on_rep' }),
    ]
    const counts = countChatViews(rows, false)
    expect(counts.followups).toBe(rows.filter((r) => chatViewMatches(r, 'followups')).length)
    expect(counts.followups).toBe(2)
  })
})

describe('REP_HOME_INBOX_LINK_FILTER_PARITY', () => {
  it('REP_HOME_INBOX_LINK_FILTER_PARITY: every metric deep-links to its canonical view', () => {
    expect(inboxViewHref('waiting_me')).toBe('/chats?view=waiting_me')
    expect(inboxViewHref('waiting_them')).toBe('/chats?view=waiting_them')
    expect(inboxViewHref('followups')).toBe('/chats?view=followups')
    const byId = new Map(INBOX_PRIMARY_VIEWS.map((v) => [v.id, v.value]))
    expect(byId.get('needs-reply')).toBe('waiting_me')
    expect(byId.get('waiting')).toBe('waiting_them')
    expect(byId.get('follow-ups')).toBe('followups')
  })
})

describe('REP_INBOX_EXECUTABLE_PROFILE_SCOPE_PARITY', () => {
  it('REP_INBOX_EXECUTABLE_PROFILE_SCOPE_PARITY: both surfaces use the same executable identity scope', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    const dashboard = read('src/app/(app)/dashboard/page.tsx')
    // The Inbox queue is scoped to the rep's executable identities, not one
    // active workspace.
    expect(page).toContain('getAuthorizedIdentities')
    expect(page).toContain('executableIdentities')
    expect(page).not.toContain('workspace: workspace ? { id: workspace.id')
    // The dashboard reads the same authorized identity set.
    expect(dashboard).toContain('executableIdentities: workspace.identities')
  })

  it('REP_INBOX_EXECUTABLE_PROFILE_SCOPE_PARITY: a lead belongs to any executable identity', () => {
    const identities = [
      { id: 'id-1', profileId: 'prof-1' },
      { id: 'id-2', profileId: 'prof-2' },
    ]
    expect(leadBelongsToAnyWorkspace({ revenueIdentityId: 'id-1', senderProfileId: null }, identities)).toBe(true)
    expect(leadBelongsToAnyWorkspace({ revenueIdentityId: 'id-2', senderProfileId: null }, identities)).toBe(true)
    expect(leadBelongsToAnyWorkspace({ revenueIdentityId: 'id-3', senderProfileId: null }, identities)).toBe(false)
    // Unstamped leads still resolve through their sender profile.
    expect(leadBelongsToAnyWorkspace({ revenueIdentityId: null, senderProfileId: 'prof-2' }, identities)).toBe(true)
    expect(leadBelongsToAnyWorkspace({ revenueIdentityId: null, senderProfileId: 'prof-9' }, identities)).toBe(false)
  })
})

describe('BACKUP_ONLY_INBOX_EXCLUDED', () => {
  it('BACKUP_ONLY_INBOX_EXCLUDED: an empty executable set excludes every lead', () => {
    expect(leadBelongsToAnyWorkspace({ revenueIdentityId: 'id-1', senderProfileId: null }, [])).toBe(false)
    expect(leadBelongsToAnyWorkspace({ revenueIdentityId: null, senderProfileId: 'prof-1' }, [])).toBe(false)
  })
})

describe('ACTIVE_COVERAGE_INBOX_INCLUDED', () => {
  it('ACTIVE_COVERAGE_INBOX_INCLUDED: a covered identity is executable for the covering rep', () => {
    const identities = [
      { id: 'own-1', profileId: 'own-prof' },
      { id: 'covered-1', profileId: 'covered-prof' },
    ]
    expect(leadBelongsToAnyWorkspace({ revenueIdentityId: 'covered-1', senderProfileId: null }, identities)).toBe(true)
  })
})

describe('INBOX_COUNT_DESTINATION_PARITY', () => {
  it('INBOX_COUNT_DESTINATION_PARITY: visible count equals rows in the destination filter', () => {
    const rows = [
      row({ leadId: 'a', state: 'waiting_on_rep' }),
      row({ leadId: 'b', state: 'waiting_on_rep' }),
      row({ leadId: 'c', state: 'waiting_on_prospect' }),
      row({ leadId: 'd', state: 'follow_up_due' }),
      row({ leadId: 'e', state: 'meeting' }),
      row({ leadId: 'f', state: 'closed' }),
    ]
    const counts = countChatViews(rows, false)
    const views: ChatView[] = ['all', 'waiting_me', 'waiting_them', 'followups', 'closed']
    for (const view of views) {
      expect(counts[view]).toBe(rows.filter((r) => chatViewMatches(r, view)).length)
    }
    expect(counts.waiting_me).toBe(2)
    expect(counts.waiting_them).toBe(2)
    expect(counts.followups).toBe(1)
    expect(counts.all).toBe(5)
  })

  it('INBOX_COUNT_DESTINATION_PARITY: zero and one row both satisfy the contract', () => {
    const none: ChatRow[] = []
    expect(countChatViews(none, false).waiting_me).toBe(0)

    const one = [row({ leadId: 'only', state: 'waiting_on_rep' })]
    expect(countChatViews(one, false).waiting_me).toBe(1)
  })
})

// ─── Canonical count authority ────────────────────────────────────────────────

const ORG = 'org-1'
const REP = 'rep-1'
const PRIMARY_REP = 'rep-2'

function seedInbox(): FakeSupabase {
  return createFakeSupabase({
    revenue_identities: [
      { id: 'id-1', organization_id: ORG, identity_name: 'Dawood LinkedIn', profile_id: 'prof-1', status: 'active' },
      { id: 'id-2', organization_id: ORG, identity_name: 'Covered Profile', profile_id: 'prof-2', status: 'active' },
      { id: 'id-3', organization_id: ORG, identity_name: 'Backup Only', profile_id: 'prof-3', status: 'active' },
    ],
    reps: [
      { id: REP, organization_id: ORG, name: 'Dawood' },
      { id: PRIMARY_REP, organization_id: ORG, name: 'Madiha' },
    ],
    leads: [
      // Canonical waiting_on_rep: client moved last.
      { id: 'l1', organization_id: ORG, owner_rep_id: REP, revenue_identity_id: 'id-1', status: 'replied', archived: false, is_test: false, contact_name: 'A', company: 'Aco', company_key: 'aco', sender_profile_id: null },
      // Canonical follow_up_due: we moved last and the follow-up clock passed.
      { id: 'l2', organization_id: ORG, owner_rep_id: REP, revenue_identity_id: 'id-1', status: 'contacted', archived: false, is_test: false, contact_name: 'B', company: 'Bco', company_key: 'bco', sender_profile_id: null },
      // Canonical waiting_on_prospect: we moved last, follow-up not due.
      { id: 'l3', organization_id: ORG, owner_rep_id: REP, revenue_identity_id: 'id-1', status: 'contacted', archived: false, is_test: false, contact_name: 'C', company: 'Cco', company_key: 'cco', sender_profile_id: null },
      // Covered profile: owned by the primary, actionable by the covering rep.
      { id: 'l4', organization_id: ORG, owner_rep_id: PRIMARY_REP, revenue_identity_id: 'id-2', status: 'replied', archived: false, is_test: false, contact_name: 'D', company: 'Dco', company_key: 'dco', sender_profile_id: null },
      // Closed: never in All.
      { id: 'l5', organization_id: ORG, owner_rep_id: REP, revenue_identity_id: 'id-1', status: 'won', archived: false, is_test: false, contact_name: 'E', company: 'Eco', company_key: 'eco', sender_profile_id: null },
      // Not executable: backup-only identity.
      { id: 'l6', organization_id: ORG, owner_rep_id: REP, revenue_identity_id: 'id-3', status: 'replied', archived: false, is_test: false, contact_name: 'F', company: 'Fco', company_key: 'fco', sender_profile_id: null },
      // Archived: excluded by the canonical loader.
      { id: 'l7', organization_id: ORG, owner_rep_id: REP, revenue_identity_id: 'id-1', status: 'replied', archived: true, is_test: false, contact_name: 'G', company: 'Gco', company_key: 'gco', sender_profile_id: null },
    ],
    conversation_states: [
      { lead_id: 'l1', organization_id: ORG, stage: 'replied', last_sent_at: hoursAgo(20), last_reply_at: hoursAgo(2), next_followup_at: null, won_at: null, lost_at: null },
      { lead_id: 'l2', organization_id: ORG, stage: 'contacted', last_sent_at: hoursAgo(20), last_reply_at: null, next_followup_at: hoursAgo(1), won_at: null, lost_at: null },
      { lead_id: 'l3', organization_id: ORG, stage: 'contacted', last_sent_at: hoursAgo(20), last_reply_at: null, next_followup_at: hoursAgo(-20), won_at: null, lost_at: null },
      { lead_id: 'l4', organization_id: ORG, stage: 'replied', last_sent_at: hoursAgo(20), last_reply_at: hoursAgo(2), next_followup_at: null, won_at: null, lost_at: null },
      { lead_id: 'l5', organization_id: ORG, stage: 'won', last_sent_at: hoursAgo(20), last_reply_at: hoursAgo(2), next_followup_at: null, won_at: hoursAgo(1), lost_at: null },
      { lead_id: 'l6', organization_id: ORG, stage: 'replied', last_sent_at: hoursAgo(20), last_reply_at: hoursAgo(2), next_followup_at: null, won_at: null, lost_at: null },
      { lead_id: 'l7', organization_id: ORG, stage: 'replied', last_sent_at: hoursAgo(20), last_reply_at: hoursAgo(2), next_followup_at: null, won_at: null, lost_at: null },
    ],
  })
}

describe('GET_INBOX_COUNTS_FOR_REP', () => {
  it('GET_INBOX_COUNTS_FOR_REP: derives the canonical counts over executable profiles', async () => {
    const { client } = seedInbox()
    const counts = await getInboxCountsForRep(client as never, {
      orgId: ORG,
      repId: REP,
      executableIdentities: [
        { id: 'id-1', profileId: 'prof-1' },
        { id: 'id-2', profileId: 'prof-2' },
      ],
      coveredIdentityIds: ['id-2'],
    }, NOW)

    expect(counts.needsReply).toBe(2) // l1 + covered l4
    expect(counts.followups).toBe(1) // l2
    expect(counts.waitingOnClient).toBe(1) // l3
    expect(counts.all).toBe(4) // l1, l2, l3, l4 — closed and backup-only excluded
  })

  it('GET_INBOX_COUNTS_FOR_REP: backup-only scope yields zero, not the owned-lead count', async () => {
    const { client } = seedInbox()
    const counts = await getInboxCountsForRep(client as never, {
      orgId: ORG,
      repId: REP,
      executableIdentities: [],
      coveredIdentityIds: [],
    }, NOW)

    expect(counts).toEqual({ needsReply: 0, waitingOnClient: 0, followups: 0, all: 0 })
  })
})

describe('REP_HOME_PARITY_WITH_CANONICAL_DERIVATION', () => {
  it('REP_HOME_PARITY_WITH_CANONICAL_DERIVATION: a replied lead we already answered is not waiting on the rep', () => {
    // Dawood's production contradiction: status 'replied' but the rep's own
    // outbound is the latest meaningful message.
    const derived = deriveConversationRow(
      { id: 'x', contactName: 'Client', company: 'Acme', companyKey: 'acme', ownerRepId: REP, profileName: 'Dawood', status: 'replied' },
      { stage: 'replied', lastSentAt: hoursAgo(1), lastReplyAt: hoursAgo(5), nextFollowupAt: null, wonAt: null, lostAt: null },
      'Dawood',
      NOW,
    )
    expect(derived?.state).toBe('waiting_on_prospect')
    expect(chatViewMatches({ ...row({ leadId: 'x' }), ...derived } as ChatRow, 'waiting_me')).toBe(false)
  })
})
