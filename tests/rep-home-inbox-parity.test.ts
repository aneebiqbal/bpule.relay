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
  loadChatQueue,
  type ChatRow,
  type ChatView,
} from '@/lib/operations/chat-queue'
import { deriveConversationRow } from '@/lib/operations/conversations'
import { leadBelongsToAnyWorkspace } from '@/lib/workspace/active-identity'
import { getInboxCountsForRep } from '@/lib/operations/inbox-counts'
import { inboxViewHref, INBOX_PRIMARY_VIEWS } from '@/lib/navigation/inbox-nav'
import { assembleManagerHomeTeamData } from '@/lib/team/manager-home-summary'
import type { TeamDaySummary } from '@/lib/rep-day/team'
import type { TeamLivePayload } from '@/lib/admin/team-live'
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

describe('REP_HOME_INBOX_COUNT_DESTINATION_PARITY', () => {
  it('REP_HOME_INBOX_COUNT_DESTINATION_PARITY: the Rep Home count equals the Inbox destination count', async () => {
    const { client } = seedInbox()
    const scope = {
      orgId: ORG,
      repId: REP,
      executableIdentities: [
        { id: 'id-1', profileId: 'prof-1' },
        { id: 'id-2', profileId: 'prof-2' },
      ] as const,
      coveredIdentityIds: ['id-2'],
    }
    const repHome = await getInboxCountsForRep(client as never, scope, NOW)
    const inbox = await loadChatQueue(client as never, {
      orgId: ORG,
      repIds: [REP],
      executableIdentities: [...scope.executableIdentities],
      coveredIdentityIds: scope.coveredIdentityIds,
      view: 'all',
      managerViews: false,
    }, NOW)
    expect(repHome.needsReply).toBe(inbox.counts.waiting_me ?? 0)
    expect(repHome.waitingOnClient).toBe(inbox.counts.waiting_them ?? 0)
    expect(repHome.followups).toBe(inbox.counts.followups ?? 0)
    expect(repHome.all).toBe(inbox.counts.all ?? 0)
    // The destination rows are exactly the filtered rows.
    expect(inbox.rows.filter((r) => chatViewMatches(r, 'waiting_me'))).toHaveLength(repHome.needsReply)
  })
})

describe('INBOX_COVERAGE_EXECUTION_SCOPE', () => {
  it('INBOX_COVERAGE_EXECUTION_SCOPE: the covering rep executes the covered profile\'s actionable work', async () => {
    const { client } = seedInbox()
    // Madiha covers id-2, whose lead l4 is owned by Dawood. Coverage is shared
    // execution: the covering rep sees it, and the primary still owns it.
    const covering = await getInboxCountsForRep(client as never, {
      orgId: ORG,
      repId: 'rep-3',
      executableIdentities: [{ id: 'id-2', profileId: 'prof-2' }],
      coveredIdentityIds: ['id-2'],
    }, NOW)
    expect(covering.needsReply).toBe(1)

    const primary = await getInboxCountsForRep(client as never, {
      orgId: ORG,
      repId: PRIMARY_REP,
      executableIdentities: [{ id: 'id-2', profileId: 'prof-2' }],
      coveredIdentityIds: [],
    }, NOW)
    expect(primary.needsReply).toBe(1)

    // A rep with no assignment and no coverage never sees the covered lead.
    const outsider = await getInboxCountsForRep(client as never, {
      orgId: ORG,
      repId: 'rep-4',
      executableIdentities: [{ id: 'id-2', profileId: 'prof-2' }],
      coveredIdentityIds: [],
    }, NOW)
    expect(outsider.needsReply).toBe(0)
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

// ─── Role matrix contracts ────────────────────────────────────────────────────

describe('REP_INBOX_EXECUTION_PARITY', () => {
  it('REP_INBOX_EXECUTION_PARITY: Rep Home and Inbox read one canonical authority', () => {
    const dashboard = read('src/app/(app)/dashboard/page.tsx')
    const page = read('src/app/(app)/chats/page.tsx')
    expect(dashboard).toContain('getInboxCountsForRep')
    expect(page).toContain('loadChatQueue')
    // Both call the same loader with the same executable-identity scope.
    expect(dashboard).toContain('executableIdentities: workspace.identities')
    expect(page).toContain('executableIdentities')
  })
})

describe('MANAGER_PERSONAL_INBOX_PARITY', () => {
  it('MANAGER_PERSONAL_INBOX_PARITY: Manager personal metrics read the canonical counts and deep-link to their views', () => {
    const manager = read('src/components/v4/v4-manager-home.tsx')
    expect(manager).not.toContain('deriveTodayCounts')
    expect(manager).toMatch(/personal\.day\?\.repliesWaiting/)
    expect(manager).toMatch(/personal\.day\?\.waitingOnClient/)
    expect(manager).toMatch(/personal\.day\?\.followUpsDue/)
    expect(manager).toContain("label: 'Replies waiting'")
    expect(manager).toContain("label: 'Waiting on clients'")
    expect(manager).toContain("label: 'Follow-ups due'")
    // Personal metrics deep-link to the URL-backed personal scope.
    expect(manager).toContain("href: '/chats?view=waiting_me&scope=me'")
    expect(manager).toContain("href: '/chats?view=waiting_them&scope=me'")
    expect(manager).toContain("href: '/chats?view=followups&scope=me'")
  })
})

describe('MANAGER_TEAM_INBOX_PARITY', () => {
  it('MANAGER_TEAM_INBOX_PARITY: team rows use the canonical per-rep Inbox counts', () => {
    const teamDay = {
      businessDate: '2026-11-08',
      timezone: 'UTC',
      isWorkingDay: true,
      workdayProgress: 0.5,
      minutesRemaining: 240,
      workdayStart: '09:00',
      workdayEnd: '18:00',
      counts: { NOT_STARTED: 0, ACTIVE: 1, AT_RISK: 0, CRITICAL: 0, READY_TO_CLOSE: 0, CLOSED: 0, MISSED: 0 },
      totals: { reps: 1, requiredRemaining: 0, commitmentProgress: 0.7, repliesWaiting: 9, actionsToday: 3, pipelineCreated: 0 },
      reps: [{
        repId: 'r1', repName: 'Dawood', repRole: 'rep', state: 'ACTIVE' as const,
        checkInAt: null, closedAt: null, lateStart: false, exceptionState: 'NONE',
        commitmentProgress: 0.7, requiredRemaining: 0, minutesRemaining: 240,
        repliesWaiting: 9, actionsToday: 3, pipelineCreated: 0,
        lastActivityAt: new Date(NOW).toISOString(),
        identities: [{ id: 'id-1', name: 'Dawood LinkedIn', channel: 'linkedin' }],
      }],
    } as TeamDaySummary
    const teamLive = {
      date: '2026-11-08',
      people: [{
        repId: 'r1', repName: 'Dawood', role: 'rep',
        identities: [{ id: 'id-1', name: 'Dawood LinkedIn', title: null, channel: 'linkedin', profileId: 'prof-1', profileName: 'Dawood LinkedIn' }],
        goals: [], openLeads: [], openLeadCount: 0, outreachSent: 0, repliesHandled: 0,
        leadsSaved: 0, extractionsCount: 0, extractionFailures: 0,
        totalTarget: 10, totalCompleted: 7, totalRemaining: 3,
        lastActivityAt: new Date(NOW).toISOString(), identityCount: 1,
      }],
    } as unknown as TeamLivePayload

    const data = assembleManagerHomeTeamData({
      teamName: 'Team',
      teamDay,
      teamLive,
      allowedRepIds: new Set(['r1']),
      inboxCountsByRep: new Map([['r1', { needsReply: 2, followups: 5 }]]),
    })
    const row = data.rows.find((r) => r.repId === 'r1')
    expect(row?.repliesWaiting).toBe(2)
    expect(row?.followUpsOverdue).toBe(5)
    expect(data.metrics.repliesWaiting).toBe(2)
    expect(data.metrics.followUpsOverdue).toBe(5)
  })
})

describe('ADMIN_ORG_INBOX_PARITY', () => {
  it('ADMIN_ORG_INBOX_PARITY: Admin health reads the canonical org Inbox counts', () => {
    const summary = read('src/lib/team/admin-command-summary.ts')
    expect(summary).toMatch(/repliesWaiting: input\.inboxCounts\?\.needsReply/)
    expect(summary).toMatch(/followUpsOverdue: input\.inboxCounts\?\.followups/)
    const loader = read('src/lib/team/load-admin-command-center.ts')
    expect(loader).toContain('getInboxCountsForOrg')
  })
})

describe('INBOX_SCOPE_ROLE_PARITY', () => {
  it('INBOX_SCOPE_ROLE_PARITY: reps scope by executable identities, managers by repIds', () => {
    const queue = read('src/lib/operations/chat-queue.ts')
    expect(queue).toContain('executableIdentities')
    expect(queue).toContain('leadBelongsToAnyWorkspace')
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain('getAuthorizedIdentities')
    // Team scope (default) is not narrowed by the viewer's identities; the
    // explicit personal scope is.
    expect(page).toContain('managerViews && !personalScope ? Promise.resolve(null)')
  })
})

describe('INBOX_PROFILE_FILTER_COUNT_PARITY', () => {
  it('INBOX_PROFILE_FILTER_COUNT_PARITY: a profile filter narrows counts and rows together', async () => {
    const { client } = seedInbox()
    const queue = await loadChatQueue(client as never, {
      orgId: ORG,
      repIds: [REP],
      executableIdentities: [
        { id: 'id-1', profileId: 'prof-1' },
        { id: 'id-2', profileId: 'prof-2' },
      ],
      coveredIdentityIds: ['id-2'],
      profileId: 'id-1',
      view: 'all',
      managerViews: false,
    }, NOW)
    expect(queue.rows.every((r) => r.profileId === 'id-1')).toBe(true)
    expect(queue.counts.waiting_me).toBe(queue.rows.filter((r) => chatViewMatches(r, 'waiting_me')).length)
    expect(queue.counts.waiting_me).toBe(1)
  })
})

describe('INBOX_METRIC_DESTINATION_PARITY', () => {
  it('INBOX_METRIC_DESTINATION_PARITY: every Inbox metric links to its canonical view', () => {
    const home = read('src/components/v4/v4-rep-home.tsx')
    const manager = read('src/components/v4/v4-manager-home.tsx')
    for (const source of [home, manager]) {
      expect(source).toContain('/chats?view=waiting_me')
      expect(source).toContain('/chats?view=waiting_them')
      expect(source).toContain('/chats?view=followups')
    }
  })
})

describe('NO_DASHBOARD_USES_LEGACY_REPLY_NEEDED_COUNT', () => {
  it('NO_DASHBOARD_USES_LEGACY_REPLY_NEEDED_COUNT: the V4 dashboards do not derive reply counts from the relay engine', () => {
    const sources = [
      read('src/components/v4/v4-rep-home.tsx'),
      read('src/components/v4/v4-manager-home.tsx'),
      read('src/components/v4/v4-admin-home.tsx'),
    ]
    for (const source of sources) {
      expect(source).not.toContain('deriveTodayCounts')
      expect(source).not.toMatch(/repliesWaiting:\s*counts\./)
    }
    // The relay engine's reply task kind stays a legitimate ranking input.
    expect(read('src/lib/relay/queue-engine.ts')).toContain('reply_needed')
  })
})

describe('INBOX_MULTI_PROFILE_EXECUTION_SCOPE', () => {
  it('INBOX_MULTI_PROFILE_EXECUTION_SCOPE: a rep with multiple executable profiles sees work across all of them', async () => {
    const { client } = seedInbox()
    const all = await loadChatQueue(client as never, {
      orgId: ORG,
      repIds: [REP],
      executableIdentities: [
        { id: 'id-1', profileId: 'prof-1' },
        { id: 'id-2', profileId: 'prof-2' },
      ],
      coveredIdentityIds: ['id-2'],
      view: 'all',
      managerViews: false,
    }, NOW)
    expect(new Set(all.rows.map((r) => r.profileId))).toEqual(new Set(['id-1', 'id-2']))

    const single = await loadChatQueue(client as never, {
      orgId: ORG,
      repIds: [REP],
      executableIdentities: [{ id: 'id-1', profileId: 'prof-1' }],
      coveredIdentityIds: [],
      view: 'all',
      managerViews: false,
    }, NOW)
    expect(single.rows.every((r) => r.profileId === 'id-1')).toBe(true)
    expect(all.rows.length).toBeGreaterThan(single.rows.length)
  })
})
