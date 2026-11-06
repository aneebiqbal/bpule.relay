/**
 * Phase 8 / Slice C contracts — conversations, reports, targets,
 * notifications, Cmd-K, saved views, capability fallback, instrumentation.
 * Synthetic fixtures only; no database.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chatPriority,
  chatViewMatches,
  countChatViews,
  loadChatQueue,
  parseChatView,
  sortChatRows,
  truncatePreview,
  type ChatRow,
} from '@/lib/operations/chat-queue'
import { deriveConversationRow } from '@/lib/operations/conversations'
import { buyerIntentLevel, toThesisView } from '@/lib/operations/chat-intelligence'
import {
  averageAgeDays,
  changePct,
  loadRevenueReport,
  loadSalesReport,
  pipelineGroupForStage,
  previousWindow,
  winRate,
  withConversion,
} from '@/lib/operations/reports'
import { ACTION_EVENT_GROUPS } from '@/lib/operations/activity'
import { assembleTargets, targetStatus, targetTypeForActivity, targetTypeForEvent } from '@/lib/operations/targets'
import { categoryForType, notificationFor, toRelayNotification } from '@/lib/notifications/model'
import { deliver, notifyForEvent } from '@/lib/notifications/deliver'
import { buildSearchGroups } from '@/lib/operations/global-search'
import { commandVisible } from '@/lib/operations/search-shared'
import { isSavedViewSurface, sanitizeViewQuery, savedViewHref } from '@/lib/operations/saved-views'
import {
  allCapabilities,
  getDatabaseCapabilities,
  parseCapabilityEnv,
  probeCapabilities,
  resetCapabilityCache,
} from '@/lib/operations/capabilities'
import { instrumentClient, measureLoader, payloadBytes } from '@/lib/operations/instrumentation'
import { secondaryItems, visibleDomains } from '@/lib/navigation/relay-shell-nav'

const NOW = Date.parse('2026-11-01T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

// ─── fake Supabase client ───────────────────────────────────────────────────

interface Call {
  table: string
  ops: Array<[string, unknown[]]>
}

type Responder = (call: Call) => { data?: unknown; error?: unknown; count?: number | null }

/** Chainable PostgREST-like builder. Records every filter; resolves via `respond`. */
function fakeClient(respond: Responder) {
  const calls: Call[] = []
  const make = (table: string) => {
    const call: Call = { table, ops: [] }
    calls.push(call)
    const builder: Record<string, unknown> = {}
    const chain = (name: string) => (...args: unknown[]) => {
      call.ops.push([name, args])
      return builder
    }
    for (const m of ['select', 'eq', 'neq', 'in', 'not', 'gte', 'lt', 'lte', 'order', 'limit', 'or', 'is', 'ilike', 'insert', 'update']) {
      builder[m] = chain(m)
    }
    const result = () => {
      const r = respond(call)
      return { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null }
    }
    builder.maybeSingle = () => Promise.resolve(result())
    builder.single = () => Promise.resolve(result())
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject)
    return builder
  }
  const client = {
    from: (table: string) => make(table),
    rpc: (fn: string) => Promise.resolve(respond({ table: `rpc:${fn}`, ops: [] })),
  }
  return { client: client as never, calls }
}

const has = (call: Call, op: string, ...args: unknown[]) =>
  call.ops.some(([name, a]) => name === op && args.every((x, i) => JSON.stringify(a[i]) === JSON.stringify(x)))

// ─── chat rows ──────────────────────────────────────────────────────────────

function chatRow(over: Partial<ChatRow> & { state: ChatRow['state'] }): ChatRow {
  return {
    leadId: 'l1', person: 'Sarah Chen', company: 'Acme', companyKey: 'acme', ownerRepId: 'r1', ownerName: 'Mehak',
    profileName: 'Mehak LinkedIn', stageLabel: null, lastInboundAt: null, lastOutboundAt: null, waitingOn: null,
    ageHours: null, nextAction: 'Reply', href: '/chats?lead=l1', title: 'VP Engineering', source: 'linkedin', profileId: 'p1',
    clientIntent: null, preview: null, previewFrom: null, needsReview: false, unassigned: false, priority: 'normal',
    ...over,
  }
}

describe('CHAT_QUEUE', () => {
  it('CHAT_QUEUE_WAITING_ON_ME: client wrote last → waiting on me, priority ages', () => {
    const r = chatRow({ state: 'waiting_on_rep', ageHours: 13 })
    expect(chatViewMatches(r, 'waiting_me')).toBe(true)
    expect(chatPriority(r, null)).toBe('critical')
    expect(chatPriority({ state: 'waiting_on_rep', ageHours: 1 }, null)).toBe('normal')
    expect(chatPriority({ state: 'waiting_on_rep', ageHours: 1 }, 'meeting_request')).toBe('high')
  })

  it('CHAT_QUEUE_WAITING_ON_THEM: we wrote last (incl. meeting stage) → waiting on them', () => {
    expect(chatViewMatches(chatRow({ state: 'waiting_on_prospect' }), 'waiting_them')).toBe(true)
    expect(chatViewMatches(chatRow({ state: 'meeting' }), 'waiting_them')).toBe(true)
    expect(chatViewMatches(chatRow({ state: 'waiting_on_rep' }), 'waiting_them')).toBe(false)
  })

  it('CHAT_FOLLOWUP: follow-up due view', () => {
    expect(chatViewMatches(chatRow({ state: 'follow_up_due' }), 'followups')).toBe(true)
    expect(chatViewMatches(chatRow({ state: 'waiting_on_prospect' }), 'followups')).toBe(false)
  })

  it('CHAT_MEETING_REQUEST / CHAT_PROPOSAL_REQUEST: from the canonical last client intent', () => {
    expect(chatViewMatches(chatRow({ state: 'waiting_on_rep', clientIntent: 'meeting_request' }), 'meeting_requests')).toBe(true)
    expect(chatViewMatches(chatRow({ state: 'waiting_on_rep', clientIntent: 'pricing' }), 'proposal_requests')).toBe(true)
    expect(chatViewMatches(chatRow({ state: 'closed', clientIntent: 'meeting_request' }), 'meeting_requests')).toBe(false)
  })

  it('CHAT_MANAGER_SCOPE: oversight views exist only for managers / admins', () => {
    expect(parseChatView('over12h', false)).toBe('all')
    expect(parseChatView('over12h', true)).toBe('over12h')
    const rows = [chatRow({ state: 'waiting_on_rep', ageHours: 5 }), chatRow({ leadId: 'l2', state: 'waiting_on_rep', ageHours: 14, unassigned: true })]
    expect(countChatViews(rows, false).over4h).toBeUndefined()
    const mgr = countChatViews(rows, true)
    expect(mgr.over4h).toBe(2)
    expect(mgr.over12h).toBe(1)
    expect(mgr.unassigned).toBe(1)
  })

  it('CHAT_ORDER: priority first, then oldest wait', () => {
    const sorted = sortChatRows([
      chatRow({ leadId: 'a', state: 'waiting_on_prospect', priority: 'low', ageHours: 50 }),
      chatRow({ leadId: 'b', state: 'waiting_on_rep', priority: 'critical', ageHours: 20 }),
      chatRow({ leadId: 'c', state: 'waiting_on_rep', priority: 'critical', ageHours: 30 }),
    ])
    expect(sorted.map((r) => r.leadId)).toEqual(['c', 'b', 'a'])
  })

  it('CHAT_PREVIEW: previews are truncated server-side', () => {
    expect(truncatePreview('  Yes,\n Thursday   works  ')).toBe('Yes, Thursday works')
    expect(truncatePreview('x'.repeat(200))).toHaveLength(140)
    expect(truncatePreview('')).toBeNull()
  })

  const leadRows = [
    { id: 'l1', contact_name: 'Sarah', contact_title: 'VP', company: 'Acme', company_key: 'acme', owner_rep_id: 'r1', revenue_identity_id: 'ws1', sender_profile_id: null, status: 'replied', source: 'linkedin' },
    { id: 'l2', contact_name: 'Tom', contact_title: null, company: 'Orbit', company_key: 'orbit', owner_rep_id: 'r1', revenue_identity_id: 'ws2', sender_profile_id: null, status: 'contacted', source: 'linkedin' },
  ]
  const respond: Responder = (call) => {
    if (call.table === 'leads') return { data: leadRows }
    if (call.table === 'conversation_states')
      return { data: [
        { lead_id: 'l1', stage: 'replied', last_sent_at: hoursAgo(10), last_reply_at: hoursAgo(2), next_followup_at: null, won_at: null, lost_at: null, intent: 'meeting_request' },
        { lead_id: 'l2', stage: 'contacted', last_sent_at: hoursAgo(30), last_reply_at: null, next_followup_at: null, won_at: null, lost_at: null, intent: null },
      ] }
    if (call.table === 'messages') return { data: [{ lead_id: 'l1', direction: 'inbound', type: 'reply', sent_text: 'Yes, Thursday works', sent_at: hoursAgo(2), thread_status: 'VERIFIED' }] }
    return { data: [] }
  }

  it('CHAT_PROFILE_SCOPE: a rep sees only conversations for the active sending profile', async () => {
    const { client, calls } = fakeClient(respond)
    const queue = await loadChatQueue(client, { orgId: 'org', repIds: ['r1'], workspace: { id: 'ws1' }, view: 'all', managerViews: false }, NOW)
    expect(queue.rows.map((r) => r.leadId)).toEqual(['l1'])
    expect(queue.rows[0]).toMatchObject({ preview: 'Yes, Thursday works', previewFrom: 'client', clientIntent: 'meeting_request', href: '/chats?lead=l1' })
    expect(has(calls.find((c) => c.table === 'leads')!, 'in', 'owner_rep_id', ['r1'])).toBe(true)
  })

  it('CHAT_ADMIN_SCOPE: org scope applies no owner filter; empty scope reads nothing', async () => {
    const admin = fakeClient(respond)
    await loadChatQueue(admin.client, { orgId: 'org', repIds: null, view: 'all', managerViews: true }, NOW)
    expect(admin.calls.find((c) => c.table === 'leads')!.ops.some(([n, a]) => n === 'in' && a[0] === 'owner_rep_id')).toBe(false)
    const none = fakeClient(respond)
    const empty = await loadChatQueue(none.client, { orgId: 'org', repIds: [], view: 'all', managerViews: true }, NOW)
    expect(empty.rows).toEqual([])
    expect(none.calls).toHaveLength(0)
  })

  it('CHAT_THREAD_PARITY: queue row and Rep 360 / Account row agree on every parity field', async () => {
    const { client } = fakeClient(respond)
    const queue = await loadChatQueue(client, { orgId: 'org', repIds: ['r1'], view: 'all', managerViews: false }, NOW)
    const chat = queue.rows.find((r) => r.leadId === 'l1')!
    const reference = deriveConversationRow(
      { id: 'l1', contactName: 'Sarah', company: 'Acme', companyKey: 'acme', ownerRepId: 'r1', profileName: null, status: 'replied' },
      { stage: 'replied', lastSentAt: hoursAgo(10), lastReplyAt: hoursAgo(2), nextFollowupAt: null, wonAt: null, lostAt: null },
      null,
      NOW,
    )!
    for (const field of ['state', 'waitingOn', 'ageHours', 'nextAction', 'lastInboundAt', 'lastOutboundAt', 'ownerRepId'] as const) {
      expect(chat[field]).toEqual(reference[field])
    }
  })

  it('CHAT_INTELLIGENCE: canonical thesis and intent are read, never invented', () => {
    expect(toThesisView({ whyThisAccount: 'Hiring 5 engineers', missingEvidence: ['budget'], risks: [1, 'agency'] })).toMatchObject({
      whyThisAccount: 'Hiring 5 engineers',
      missingEvidence: ['budget'],
      risks: ['agency'],
    })
    expect(toThesisView({})).toBeNull()
    expect(toThesisView('nope')).toBeNull()
    expect(buyerIntentLevel({ buyerIntentLevel: 'high' })).toBe('HIGH')
    expect(buyerIntentLevel({ buyerIntentLevel: 'maybe' })).toBeNull()
  })
})

// ─── reports ────────────────────────────────────────────────────────────────

describe('REPORTS', () => {
  it('SALES_REPORT: step conversion, unknown counts never convert, change needs a known previous', () => {
    const steps = withConversion([{ count: 100 }, { count: 40 }, { count: null }, { count: 5 }])
    expect(steps.map((s) => s.conversionPct)).toEqual([null, 40, null, null])
    expect(changePct(12, 10)).toBe(20)
    expect(changePct(12, 0)).toBeNull()
    expect(changePct(null, 4)).toBeNull()
    expect(previousWindow('2026-11-08T00:00:00.000Z', '2026-11-15T00:00:00.000Z')).toEqual({
      start: '2026-11-01T00:00:00.000Z',
      end: '2026-11-08T00:00:00.000Z',
    })
  })

  it('SALES_REPORT_AGGREGATE: every number is a zero-row count scoped to the reps', async () => {
    // The report counts are a count query over the leads a scope selects, so
    // the lead-id resolution returns ids and every counted query is head-only.
    const { client, calls } = fakeClient((call) => {
      const select = call.ops.find(([n]) => n === 'select')
      const head = (select?.[1]?.[1] as { head?: boolean } | undefined)?.head
      return head ? { count: 7 } : { data: [{ id: 'l1' }, { id: 'l2' }] }
    })
    const report = await loadSalesReport(
      client,
      { orgId: 'org', repIds: ['r1'] },
      { start: hoursAgo(24), end: new Date(NOW).toISOString() },
      { leads: '/leads?scope=team', chats: (s) => `/chats?cstage=${s}`, activity: (e) => `/team/activity?event=${e}` },
    )
    expect(report.cohort.map((s) => s.label)).toEqual(['Qualified', 'Contacted', 'Replies', 'Meetings', 'Proposals', 'Won'])
    expect(report.cohort.every((s) => s.count === 7 && s.previous === 7)).toBe(true)
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      // The lead-id resolution selects only ids; every counted query is head-only.
      if (call.table !== 'leads') {
        const select = call.ops.find(([n]) => n === 'select')!
        expect((select[1][1] as { head?: boolean }).head).toBe(true)
      }
      const scoped = call.ops.some(([n, a]) => n === 'in' && (a[0] === 'owner_rep_id' || a[0] === 'leads.owner_rep_id' || a[0] === 'actor_id' || a[0] === 'lead_id'))
      expect(scoped).toBe(true)
    }
    expect(report.cohort.find((s) => s.key === 'meeting')!.href).toBe('/chats?cstage=meeting')
  })

  it('SALES_REPORT_FAILED_QUERY: an error is unknown (—), never zero', async () => {
    const { client } = fakeClient(() => ({ error: { message: 'boom' } }))
    const report = await loadSalesReport(client, { orgId: 'org', repIds: null }, { start: hoursAgo(1), end: new Date(NOW).toISOString() }, {
      leads: '/leads?x=1', chats: () => '/chats', activity: () => '/a',
    })
    expect(report.cohort.every((s) => s.count === null && s.conversionPct === null)).toBe(true)
  })

  it('PIPELINE_REPORT: stage groups, average age from samples, drill-down groups', () => {
    expect(pipelineGroupForStage('interested')).toBe('conversation')
    expect(pipelineGroupForStage('negotiation')).toBe('proposal')
    expect(pipelineGroupForStage('lost')).toBeNull()
    expect(averageAgeDays([hoursAgo(48), hoursAgo(24)], NOW)).toBe(1.5)
    expect(averageAgeDays([], NOW)).toBeNull()
  })

  it('ACTIVITY_REPORT: grouped filters drill into exactly the counted events', () => {
    expect(ACTION_EVENT_GROUPS.MESSAGES_SENT).toEqual(['DM_SENT', 'FOLLOWUP_SENT', 'REPLY_SENT'])
  })

  it('REVENUE_REPORT: win rate from closed outcomes; revenue is never estimated', async () => {
    expect(winRate(3, 1)).toBe(75)
    expect(winRate(0, 0)).toBeNull()
    const { client } = fakeClient((call) => {
      // The lead-id resolution returns ids; every counted query returns a count.
      const select = call.ops.find(([n]) => n === 'select')
      const head = (select?.[1]?.[1] as { head?: boolean } | undefined)?.head
      if (!head) return { data: [{ id: 'l1' }] }
      return { count: call.ops.some(([n, a]) => n === 'gte' && a[0] === 'won_at') ? 4 : 6 }
    })
    const r = await loadRevenueReport(client, { orgId: 'org', repIds: null }, { start: hoursAgo(24), end: new Date(NOW).toISOString() })
    expect(r).toMatchObject({ won: 4, lost: 6, winRatePct: 40, knownRevenue: null })
  })

  it('TEAM_REPORT: Insights rail is role-aware (reports for everyone, AI usage for admins)', () => {
    const rep = secondaryItems('insights', { isOwner: false, isAdmin: false, isManager: false }).map((i) => i.href)
    const mgr = secondaryItems('insights', { isOwner: false, isAdmin: false, isManager: true }).map((i) => i.href)
    const admin = secondaryItems('insights', { isOwner: false, isAdmin: true, isManager: true }).map((i) => i.href)
    const reports = ['/reports/sales', '/reports/pipeline', '/reports/team', '/reports/revenue', '/reports/activity']
    expect(rep).toEqual(reports)
    expect(mgr).toEqual(reports)
    expect(admin).toEqual([...reports, '/admin/ai-usage'])
    expect(visibleDomains({ isOwner: false, isAdmin: false, isManager: false }).find((i) => i.id === 'insights')!.href).toBe('/reports/sales')
  })
})

// ─── targets ────────────────────────────────────────────────────────────────

describe('TARGETS', () => {
  const base = {
    period: 'DAY' as const,
    elapsedShare: 0.5,
    reps: [{ id: 'r1', name: 'Mehak' }, { id: 'r2', name: 'Aneeb' }],
    teams: [{ id: 't1', name: 'BD', memberIds: ['r1', 'r2'] }],
    dailyTargets: [
      { rep_id: 'r1', activity_type: 'dm', target_count: 10 },
      { rep_id: 'r1', activity_type: 'followup', target_count: 3 },
      { rep_id: 'r1', activity_type: 'connection_request', target_count: 20 },
      { rep_id: 'r2', activity_type: 'dm', target_count: 5 },
      { rep_id: 'r2', activity_type: 'prospect_extracted', target_count: 15 },
    ],
    events: [
      { actor_id: 'r1', action_type: 'DM_PREPARED', execution_status: 'generated' },
      { actor_id: 'r1', action_type: 'CONNECTION_PREPARED', execution_status: 'generated' },
      { actor_id: 'r1', action_type: 'DM_SENT', execution_status: 'failed' },
      { actor_id: 'r1', action_type: 'DM_SENT', execution_status: 'sent' },
      { actor_id: 'r1', action_type: 'FOLLOWUP_SENT', execution_status: 'sent' },
      { actor_id: 'r1', action_type: 'MEETING_BOOKED', execution_status: 'sent' },
      { actor_id: 'r2', action_type: 'DM_SENT', execution_status: 'sent' },
    ],
  }

  it('TARGET_DRAFT_NOT_COUNTED: drafts, generated copy and failures never count', () => {
    expect(targetTypeForEvent('DM_PREPARED')).toBeNull()
    expect(targetTypeForEvent('CONNECTION_PREPARED')).toBeNull()
    expect(targetTypeForEvent('DM_SENT', 'failed')).toBeNull()
    const data = assembleTargets(base)
    const r1 = data.reps.find((r) => r.ownerId === 'r1')!
    expect(r1.cells.find((c) => c.type === 'CONNECTIONS')!.progress).toBe(0)
  })

  it('TARGET_SENT_COUNTS: messages = DM + follow-up + reply sends against dm+followup goals', () => {
    const data = assembleTargets(base)
    const msgs = data.reps.find((r) => r.ownerId === 'r1')!.cells.find((c) => c.type === 'MESSAGES_SENT')!
    expect(msgs).toMatchObject({ goal: 13, progress: 2, remaining: 11, derived: false })
    const team = data.teams[0].cells.find((c) => c.type === 'MESSAGES_SENT')!
    expect(team).toMatchObject({ goal: 18, progress: 3 })
    expect(data.ignoredActivityTypes).toEqual(['prospect_extracted'])
  })

  it('TARGET_MEETING_COUNTS: meetings count events; no stored goal → no target, not 0%', () => {
    const data = assembleTargets(base)
    const meet = data.reps.find((r) => r.ownerId === 'r1')!.cells.find((c) => c.type === 'MEETINGS')!
    expect(meet).toMatchObject({ goal: null, progress: 1, status: 'no_target', remaining: null })
  })

  it('TARGET_PERIOD_DERIVED: week goal = daily × 5 working days, labelled derived', () => {
    const week = assembleTargets({ ...base, period: 'WEEK' })
    expect(week.reps[0].cells.find((c) => c.type === 'CONNECTIONS')).toMatchObject({ goal: 100, derived: true })
    expect(targetTypeForActivity('email')).toBe('MESSAGES_SENT')
    expect(targetStatus(10, 10, 0.3)).toBe('met')
    expect(targetStatus(10, 1, 0.9)).toBe('at_risk')
    expect(targetStatus(10, 4, 0.5)).toBe('on_track')
  })
})

// ─── notifications ──────────────────────────────────────────────────────────

describe('NOTIFICATIONS', () => {
  it('NOTIFICATION_REPLY: inbound reply notifies the owner and deep-links to the thread', () => {
    const n = notificationFor({ kind: 'INBOUND_REPLY', leadId: 'l1', messageId: 'm1', ownerRepId: 'r1', actorRepId: null, person: 'Sarah', company: 'Acme', text: 'Sounds good' })!
    expect(n).toMatchObject({ recipientId: 'r1', type: 'reply_received', link: '/chats?lead=l1', dedupeKey: 'reply_received:l1:m1' })
    expect(categoryForType(n.type)).toBe('replies')
  })

  it('NOTIFICATION_TASK: assignment / request-update / overdue map to the right category and link', () => {
    const a = notificationFor({ kind: 'TASK_ASSIGNED', taskId: 't1', assigneeRepId: 'r1', actorRepId: 'm1', actorName: 'Hassan', title: 'Review' })!
    expect(a).toMatchObject({ type: 'task_assigned', link: '/tasks?task=assigned:t1', body: 'Review by Hassan' })
    const u = notificationFor({ kind: 'UPDATE_REQUESTED', taskId: 't2', assigneeRepId: 'r1', actorRepId: 'm1', actorName: null, title: 'Status?' })!
    expect(categoryForType(u.type)).toBe('admin_requests')
    const o = notificationFor({ kind: 'TASK_OVERDUE', taskId: 't3', assigneeRepId: 'r1', title: 'Call', dueAt: '2026-11-01T09:00:00Z' })!
    expect(o.dedupeKey).toBe('task_overdue:t3:2026-11-01T09:00:00Z')
  })

  it('NOTIFICATION_ROLE_SCOPE: no self-notifications, no UI-event notifications, recipient-only', () => {
    expect(notificationFor({ kind: 'INBOUND_REPLY', leadId: 'l1', messageId: 'm1', ownerRepId: 'r1', actorRepId: 'r1', person: 'S', company: null, text: 'Sounds good' })).toBeNull()
    expect(notificationFor({ kind: 'TASK_ASSIGNED', taskId: 't', assigneeRepId: 'm1', actorRepId: 'm1', actorName: null, title: 'x' })).toBeNull()
    for (const kind of ['LEAD_OPENED', 'FILTER_CHANGED', 'DRAFT_GENERATED', 'SCORE_RECALCULATED'] as const) {
      expect(notificationFor({ kind })).toBeNull()
    }
    expect(toRelayNotification({ id: 'n', notification_type: 'mystery', title: 'T', body: '  ', link: 'https://evil.example', read: false, created_at: hoursAgo(1) })).toMatchObject({
      category: 'system',
      body: null,
      href: '/notifications',
    })
  })

  it('NOTIFICATION_DEDUPE: the same reply replayed stores one notification', async () => {
    const stored = new Set<string>()
    let inserts = 0
    const { client } = fakeClient((call) => {
      const key = call.ops.find(([n, a]) => n === 'eq' && a[0] === 'dedupe_key')?.[1][1] as string | undefined
      if (call.ops.some(([n]) => n === 'insert')) {
        inserts += 1
        const row = call.ops.find(([n]) => n === 'insert')![1][0] as { dedupe_key: string }
        stored.add(row.dedupe_key)
        return { data: null }
      }
      return { data: key && stored.has(key) ? { id: 'existing' } : null }
    })
    const event = { kind: 'INBOUND_REPLY' as const, leadId: 'l1', messageId: 'm1', ownerRepId: 'r1', actorRepId: null, person: 'Sarah', company: 'Acme', text: 'Sounds good' }
    expect(await notifyForEvent(client, 'org', event)).toBe('delivered')
    expect(await notifyForEvent(client, 'org', event)).toBe('duplicate')
    expect(await notifyForEvent(client, 'org', { kind: 'LEAD_OPENED' })).toBe('skipped')
    expect(inserts).toBe(1)
  })

  it('NOTIFICATION_DEDUPE_RACE: a unique violation is a duplicate; a missing table is unavailable, not success', async () => {
    const race = fakeClient((call) => (call.ops.some(([n]) => n === 'insert') ? { error: { code: '23505' } } : { data: null }))
    const input = { organizationId: 'o', recipientId: 'r', type: 't', title: 'x', body: '', link: '/x', dedupeKey: 'k' }
    expect(await deliver(race.client, input)).toBe('duplicate')
    const missing = fakeClient(() => ({ error: { code: '42P01', message: 'relation "notifications" does not exist' } }))
    expect(await deliver(missing.client, input)).toBe('unavailable')
  })
})

// ─── Cmd-K ──────────────────────────────────────────────────────────────────

describe('CMDK', () => {
  it('CMDK_GROUPS: people, companies, leads, tasks, conversations with direct deep links', () => {
    const groups = buildSearchGroups({
      term: 'acme',
      people: [{ id: 'r1', name: 'Acme Mehak' }],
      leads: [{ id: 'l1', contact_name: 'Sarah', company: 'Acme', company_key: 'acme', contact_title: null }],
      conversationLeadIds: new Set(['l1']),
      tasks: [{ id: 't1', title: 'Acme follow-up', status: 'OPEN', assigneeName: null }],
      canOpenRep: true,
    })
    expect(Object.keys(groups)).toEqual(['people', 'companies', 'leads', 'tasks', 'conversations'])
    expect(groups.leads[0].href).toBe('/leads/l1')
    expect(groups.conversations[0].href).toBe('/chats?lead=l1')
    expect(groups.tasks[0].href).toBe('/tasks?task=assigned:t1')
    expect(groups.companies[0].href).toBe('/accounts/acme')
    expect(groups.people[0].href).toBe('/team/r1')
  })

  it('CMDK_COMMANDS / CMDK_ROLE_SCOPE: manager and admin commands are hidden from reps', () => {
    const rep = { isAdmin: false, isManager: false }
    const manager = { isAdmin: false, isManager: true }
    const admin = { isAdmin: true, isManager: true }
    expect(commandVisible({ id: 'check-prospect', group: 'Relay' }, rep)).toBe(true)
    expect(commandVisible({ id: 'reports', group: 'Navigation' }, rep)).toBe(true)
    expect(commandVisible({ id: 'create-task', group: 'Relay' }, rep)).toBe(false)
    expect(commandVisible({ id: 'team', group: 'Navigation' }, rep)).toBe(false)
    expect(commandVisible({ id: 'team', group: 'Navigation' }, manager)).toBe(true)
    expect(commandVisible({ id: 'accounts', group: 'Admin' }, manager)).toBe(false)
    expect(commandVisible({ id: 'accounts', group: 'Admin' }, admin)).toBe(true)
  })
})

// ─── saved views / capabilities / instrumentation ───────────────────────────

describe('SAVED_VIEW_PRIVATE', () => {
  it('stores filters, sort and view mode only; conversation selection is not saved', () => {
    expect(sanitizeViewQuery('view=waiting_me&rep=r1&sort=age&dir=asc&lead=l1&page=2')).toBe('view=waiting_me&rep=r1&sort=age&dir=asc')
    expect(isSavedViewSurface('chats')).toBe(true)
    expect(isSavedViewSurface('reports.sales')).toBe(true)
    expect(savedViewHref('chats', 'view=over4h')).toBe('/chats?view=over4h')
  })
})

describe('DATABASE_CAPABILITIES', () => {
  afterEach(() => {
    delete process.env.RELAY_DB_CAPABILITIES
    resetCapabilityCache()
  })

  it('env override: all / none / list; unknown keys ignored', () => {
    expect(parseCapabilityEnv('all')!.internalNotes).toBe(true)
    expect(parseCapabilityEnv('none')!.assignedTasks).toBe(false)
    const list = parseCapabilityEnv('savedViews, internalNotes, bogus')!
    expect(list).toMatchObject({ savedViews: true, internalNotes: true, assignedTasks: false, meetingEvents: false })
    expect(parseCapabilityEnv('')).toBeNull()
  })

  it('probe: missing tables / functions are unavailable; meeting events need the env', async () => {
    const { client } = fakeClient((call) => {
      if (call.table === 'internal_notes' || call.table === 'saved_views') return { error: { code: '42P01', message: 'relation does not exist' } }
      if (call.table === 'rpc:manages_team') return { error: { code: 'PGRST202' } }
      return { count: 0 }
    })
    const caps = await probeCapabilities(client)
    expect(caps).toMatchObject({ assignedTasks: true, notifications: true, internalNotes: false, savedViews: false, teamScopedActivity: false, meetingEvents: false })
  })

  it('probe: a rejecting builder disables only its own capability', async () => {
    // The Neon adapter rejects a failed builder rather than resolving it, so a
    // single unmigrated table must not take every capability down with it.
    const client = {
      from: (table: string) => {
        const builder: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'neq', 'in', 'not', 'gte', 'lt', 'lte', 'order', 'limit', 'or', 'is', 'ilike']) {
          builder[m] = () => builder
        }
        const settle = () =>
          table === 'lead_message_previews'
            ? Promise.reject(new Error('Neon query failed: relation "lead_message_previews" does not exist'))
            : Promise.resolve({ data: [], error: null, count: 0 })
        builder.maybeSingle = settle
        builder.single = settle
        builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => settle().then(res, rej)
        return builder
      },
      rpc: () => Promise.resolve({ data: [], error: null }),
    }
    const caps = await probeCapabilities(client as never)
    expect(caps.assignedTasks).toBe(true)
    expect(caps.internalNotes).toBe(true)
    expect(caps.messagePreviews).toBe(false)
  })

  it('getDatabaseCapabilities: env wins; probe is cached (no per-request probing)', async () => {
    process.env.RELAY_DB_CAPABILITIES = 'all'
    expect(await getDatabaseCapabilities(null)).toEqual(allCapabilities(true))
    delete process.env.RELAY_DB_CAPABILITIES
    resetCapabilityCache()
    const { client, calls } = fakeClient(() => ({ count: 0 }))
    await getDatabaseCapabilities(client)
    const after = calls.length
    await getDatabaseCapabilities(client)
    expect(calls.length).toBe(after)
  })
})

describe('PERFORMANCE_INSTRUMENTATION', () => {
  afterEach(() => {
    delete process.env.RELAY_PERF_LOG
  })

  it('counts queries and payload bytes only when enabled', async () => {
    const counter = { count: 0 }
    const { client } = fakeClient(() => ({ data: [] }))
    const wrapped = instrumentClient(client, counter) as unknown as { from: (t: string) => unknown }
    wrapped.from('a')
    wrapped.from('b')
    expect(counter.count).toBe(2)
    expect(payloadBytes({ a: 'é' })).toBe(10)

    const sink = vi.fn()
    await measureLoader('off', async () => 1, client, sink)
    expect(sink).not.toHaveBeenCalled()
    process.env.RELAY_PERF_LOG = '1'
    await measureLoader('on', async (c) => {
      ;(c as unknown as { from: (t: string) => unknown }).from('x')
      return { ok: true }
    }, client, sink)
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ name: 'on', queries: 1, bytes: 11 }))
  })
})
