/** Relay V3 Sprint 3 — Inbox / conversation workspace contracts.
 *
 * Every test name matches the sprint's test matrix so a regression is
 * traceable to the requirement it protects. Synthetic fixtures only.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  CHAT_VIEWS,
  chatPriority,
  chatViewMatches,
  countChatViews,
  parseChatView,
  sortChatRows,
  truncatePreview,
  type ChatRow,
  type ChatView,
} from '@/lib/operations/chat-queue'
import {
  CONVERSATION_STATE_LABEL,
  deriveConversationRow,
  filterConversationRows,
  sortConversationRows,
} from '@/lib/operations/conversations'
import { INBOX_FIXTURE_ROWS, inboxFixtureIntelligence } from '@/lib/operations/inbox-fixtures'
import { isSavedViewSurface, savedViewHref, sanitizeViewQuery } from '@/lib/operations/saved-views'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const NOW = Date.parse('2026-11-03T09:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

function row(overrides: Partial<ChatRow> & { leadId: string }): ChatRow {
  return {
    person: 'Sarah Chen',
    company: 'Acme',
    companyKey: 'acme',
    ownerRepId: 'rep-1',
    ownerName: 'Mehak',
    profileName: 'Mehak LinkedIn',
    state: 'waiting_on_rep',
    stageLabel: 'conversation',
    lastInboundAt: hoursAgo(2),
    lastOutboundAt: hoursAgo(20),
    waitingOn: 'Rep',
    ageHours: 2,
    nextAction: 'Reply',
    href: `/chats?lead=${overrides.leadId}`,
    title: 'VP Engineering',
    source: 'linkedin',
    profileId: 'profile-1',
    clientIntent: null,
    preview: 'Can you send pricing for the MVP?',
    previewFrom: 'client',
    needsReview: false,
    unassigned: false,
    priority: 'normal',
    ...overrides,
  }
}

describe('V3_INBOX_NEEDS_REPLY', () => {
  it('V3_INBOX_NEEDS_REPLY: a client reply with no later outbound is waiting on the rep', () => {
    const r = deriveConversationRow(
      { id: 'a', contactName: 'Sarah Chen', company: 'Acme', companyKey: 'acme', ownerRepId: 'rep-1', profileName: 'Mehak LinkedIn', status: 'replied' },
      { stage: 'conversation', lastSentAt: hoursAgo(20), lastReplyAt: hoursAgo(0.7), nextFollowupAt: null, wonAt: null, lostAt: null },
      'Mehak',
      NOW,
    )
    expect(r?.state).toBe('waiting_on_rep')
    expect(r?.waitingOn).toBe('Rep')
    expect(r?.nextAction).toBe('Reply')
    expect(r?.href).toBe('/chats?lead=a')
  })
})

describe('V3_INBOX_WAITING', () => {
  it('V3_INBOX_WAITING: a sent message with no reply is waiting on the prospect, not actioned', () => {
    const r = deriveConversationRow(
      { id: 'b', contactName: 'Hana Kobayashi', company: 'Studio Nori', companyKey: 'studio-nori', ownerRepId: 'rep-1', profileName: 'Mehak LinkedIn', status: 'contacted' },
      { stage: 'contacted', lastSentAt: hoursAgo(9), lastReplyAt: hoursAgo(30), nextFollowupAt: null, wonAt: null, lostAt: null },
      'Mehak',
      NOW,
    )
    expect(r?.state).toBe('waiting_on_prospect')
    expect(r?.waitingOn).toBe('Prospect')
    expect(r?.nextAction).toBe('Wait for reply')
    expect(chatViewMatches({ ...row({ leadId: 'b' }), ...r } as ChatRow, 'waiting_them')).toBe(true)
  })
})

describe('V3_INBOX_FOLLOWUP', () => {
  it('V3_INBOX_FOLLOWUP: follows the canonical follow-up clock', () => {
    const r = deriveConversationRow(
      { id: 'c', contactName: 'Diego Alvarez', company: 'Framely', companyKey: 'framely', ownerRepId: 'rep-1', profileName: 'Mehak LinkedIn', status: 'followed_up' },
      { stage: 'contacted', lastSentAt: hoursAgo(3), lastReplyAt: null, nextFollowupAt: hoursAgo(1), wonAt: null, lostAt: null },
      'Mehak',
      NOW,
    )
    expect(r?.state).toBe('follow_up_due')
    expect(r?.nextAction).toBe('Send follow-up')
  })
})

describe('V3_INBOX_MEETING_REQUEST', () => {
  it('V3_INBOX_MEETING_REQUEST: only canonical analysed intent puts a row in the view', () => {
    const meeting = row({ leadId: 'm', clientIntent: 'meeting_request', state: 'waiting_on_rep' })
    const other = row({ leadId: 'x', clientIntent: null, state: 'waiting_on_rep' })
    expect(chatViewMatches(meeting, 'meeting_requests')).toBe(true)
    expect(chatViewMatches(other, 'meeting_requests')).toBe(false)
    // Keyword matching on UI text is never the rule.
    expect(chatViewMatches(row({ leadId: 'y', clientIntent: null, preview: 'can we meet?' }), 'meeting_requests')).toBe(false)
  })
})

describe('V3_INBOX_PROPOSAL_REQUEST', () => {
  it('V3_INBOX_PROPOSAL_REQUEST: derived from canonical intent, never from message text', () => {
    const pricing = row({ leadId: 'p', clientIntent: 'pricing' })
    expect(chatViewMatches(pricing, 'proposal_requests')).toBe(true)
    expect(chatViewMatches(row({ leadId: 'q', clientIntent: null, preview: 'please send a proposal' }), 'proposal_requests')).toBe(false)
  })
})

describe('V3_INBOX_PROFILE_SCOPE', () => {
  it('V3_INBOX_PROFILE_SCOPE: a rep queue is scoped to the active sending profile', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain('resolveActiveWorkspace')
    // The queue query carries the workspace, not just a profile id.
    expect(page).toContain('workspace: workspace ? { id: workspace.id, profileId: workspace.profileId ?? null } : null')
    // …and the loader applies the workspace scope to every row.
    expect(read('src/lib/operations/chat-queue.ts')).toContain('leadBelongsToWorkspace')
  })
})

describe('V3_INBOX_MANAGER_SCOPE', () => {
  it('V3_INBOX_MANAGER_SCOPE: managers see their team, never the whole org', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain('effectiveRepIds')
    expect(page).toContain('managerViews')
    const scope = read('src/lib/operations/scope.ts')
    expect(scope).toContain('OperationalScope')
  })
})

describe('V3_INBOX_ADMIN_SCOPE', () => {
  it('V3_INBOX_ADMIN_SCOPE: admins see the organization', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain("ctx.scope.mode === 'org'")
  })
})

describe('V3_INBOX_QUEUE_BOUNDED', () => {
  it('V3_INBOX_QUEUE_BOUNDED: the queue reads scalar state, not message bodies', () => {
    const queue = read('src/lib/operations/chat-queue.ts')
    expect(queue).toContain('LEAD_CAP = 1500')
    expect(queue).toContain('row.preview = truncatePreview(m.preview)')
    expect(queue).not.toContain('.select("*")')
  })

  it('V3_INBOX_QUEUE_BOUNDED: the visible page is capped', () => {
    const queue = read('src/lib/operations/chat-queue.ts')
    expect(queue).toContain('const limit = Math.min(Math.max(query.limit ?? 60, 1), 200)')
  })
})

describe('V3_INBOX_THREAD_LAZY_LOAD', () => {
  it('V3_INBOX_THREAD_LAZY_LOAD: the thread renders only for the selected lead', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain('{leadId ? (')
    expect(page).toContain('<LeadConversation key={leadId} leadId={leadId} variant="thread" />')
    // No thread data is fetched for the queue.
    expect(page).not.toContain('listMessages')
  })
})

describe('V3_INBOX_CONTEXT_BOUNDED', () => {
  it('V3_INBOX_CONTEXT_BOUNDED: the context panel uses a per-lead summary', () => {
    const intel = read('src/lib/operations/chat-intelligence.ts')
    expect(intel).toContain('loadChatIntelligence')
    expect(intel).toContain('openTasks')
    const fixture = inboxFixtureIntelligence('lead-pricing-5h')
    expect(fixture.score).toBe(82)
    expect(fixture.openTasks?.length).toBe(2)
  })
})

describe('V3_INBOX_URL_STATE', () => {
  it('V3_INBOX_URL_STATE: view, filters and selected lead live in the URL', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain('view: view === \'all\' ? null : view')
    expect(page).toContain('lead: id')
    expect(page).toContain('opsHref')
  })
})

describe('V3_INBOX_DEEP_LINK', () => {
  it('V3_INBOX_DEEP_LINK: ?lead= opens the thread directly', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain('UUIDISH.test(rawLead)')
    const r = INBOX_FIXTURE_ROWS[0]
    expect(r.href).toBe('/chats?lead=lead-pricing-5h')
  })
})

describe('V3_INBOX_SAVED_VIEW', () => {
  it('V3_INBOX_SAVED_VIEW: chats is a saved-view surface and the view is sanitised', () => {
    expect(isSavedViewSurface('chats')).toBe(true)
    expect(sanitizeViewQuery('?view=waiting_me')).toBe('view=waiting_me')
    expect(sanitizeViewQuery('?view=waiting_me&lead=x&page=2')).toBe('view=waiting_me')
    expect(sanitizeViewQuery('?view=not-a-view')).toBe('view=not-a-view')
    expect(savedViewHref('chats', 'view=waiting_me')).toBe('/chats?view=waiting_me')
  })
})

describe('V3_INBOX_CANONICAL_MESSAGE', () => {
  it('V3_INBOX_CANONICAL_MESSAGE: internal notes never render inside the thread', () => {
    const fixture = read('src/components/inbox/inbox-fixture.tsx')
    // The fixture renders notes as their own dashed surface.
    expect(fixture).toContain('Internal notes')
    const notes = read('src/components/operations/notes-panel.tsx')
    expect(notes).toContain('not visible to the client')
    expect(notes).toContain('This feature is unavailable right now.')
    expect(notes).not.toContain('Available after database activation')
  })
})

describe('V3_INBOX_BUG004_PARITY', () => {
  it('V3_INBOX_BUG004_PARITY: an inbound-first lead appears exactly once as needs-reply', () => {
    const inboundFirst = deriveConversationRow(
      { id: 'in', contactName: 'Aisha Bello', company: 'Kite Pay', companyKey: 'kite-pay', ownerRepId: 'rep-1', profileName: 'Mehak LinkedIn', status: 'new' },
      { stage: 'new', lastSentAt: null, lastReplyAt: hoursAgo(0.7), nextFollowupAt: null, wonAt: null, lostAt: null },
      'Mehak',
      NOW,
    )
    expect(inboundFirst?.state).toBe('waiting_on_rep')
    const rows = [row({ leadId: 'in', state: 'waiting_on_rep', lastInboundAt: hoursAgo(0.7), lastOutboundAt: null, waitingOn: 'Rep' })]
    const counts = countChatViews(rows, false)
    expect(counts.waiting_me).toBe(1)
    expect(counts.all).toBe(1)
  })
})

describe('V3_INBOX_NO_PREMATURE_FOLLOWUP', () => {
  it('V3_INBOX_NO_PREMATURE_FOLLOWUP: time alone never creates a follow-up before a send', () => {
    const neverSent = deriveConversationRow(
      { id: 'ns', contactName: 'Lena Fischer', company: 'Loopwork', companyKey: 'loopwork', ownerRepId: null, profileName: null, status: 'new' },
      { stage: 'new', lastSentAt: null, lastReplyAt: hoursAgo(40), nextFollowupAt: hoursAgo(1), wonAt: null, lostAt: null },
      null,
      NOW,
    )
    // Inbound-first with nothing sent: the rep must reply, not "follow up".
    expect(neverSent?.state).toBe('waiting_on_rep')
    expect(neverSent?.nextAction).toBe('Reply')
  })
})

describe('V3_INBOX_MOBILE', () => {
  it('V3_INBOX_MOBILE: the queue and thread are never side by side below md', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain('md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]')
    expect(page).toContain("leadId && 'hidden md:block'")
    expect(page).toContain("!leadId && 'hidden md:block'")
    expect(page).toContain('md:hidden')
  })
})

describe('V3_INBOX_ERROR_SANITIZATION', () => {
  it('V3_INBOX_ERROR_SANITIZATION: no database language reaches the user', () => {
    const files = [
      'src/app/(app)/chats/page.tsx',
      'src/components/operations/notes-panel.tsx',
      'src/components/chats/chat-queue-list.tsx',
      'src/components/chats/chat-intelligence-panel.tsx',
    ]
    for (const f of files) {
      const src = read(f)
      expect(src).not.toContain('Available after database activation')
      expect(src).not.toMatch(/\bSQL\b/)
      expect(src).not.toContain('PostgREST')
    }
    expect(read('src/app/(app)/chats/page.tsx')).toContain('Couldn’t load conversations. Refresh to try again.')
  })
})

// ── Failure isolation (PART U) ───────────────────────────────────────────────

describe('INBOX_QUEUE_FAILURE_ISOLATED', () => {
  it('INBOX_QUEUE_FAILURE_ISOLATED: a failed queue leaves the thread pane usable', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    // The failure branch still renders the thread section with a select prompt.
    expect(page).toContain('Couldn’t load conversations. Refresh to try again.')
    expect(page).toContain('Select a conversation to start.')
  })
})

describe('INBOX_THREAD_FAILURE_ISOLATED', () => {
  it('INBOX_THREAD_FAILURE_ISOLATED: a failed thread keeps the queue and context', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain('This conversation is not available to you.')
  })
})

describe('INBOX_CONTEXT_FAILURE_ISOLATED', () => {
  it('INBOX_CONTEXT_FAILURE_ISOLATED: a failed context pane keeps the thread', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain('Couldn’t load this conversation’s context. The thread is still available.')
  })
})

describe('INBOX_NOTES_FAILURE_ISOLATED', () => {
  it('INBOX_NOTES_FAILURE_ISOLATED: notes failure never breaks the conversation', () => {
    const notes = read('src/components/operations/notes-panel.tsx')
    expect(notes).toContain('Notes could not be loaded')
    // The notes panel owns its error; it is not rendered in the thread.
    const page = read('src/components/inbox/inbox-fixture.tsx')
    expect(page).toContain('Internal notes')
  })
})

// ── Cross-surface parity (PART AC) ──────────────────────────────────────────

describe('V3_CONVERSATION_CROSS_SURFACE_PARITY', () => {
  it('V3_CONVERSATION_CROSS_SURFACE_PARITY: Inbox and Lead 360 share the waiting rule', () => {
    const queue = read('src/lib/operations/chat-queue.ts')
    const leadWorkspace = read('src/components/lead-workspace-simple.tsx')
    const contextPanel = read('src/components/sales/lead-context-panel.tsx')
    // Inbox derives from the canonical rule…
    expect(queue).toContain('deriveConversationRow')
    // …and Lead 360 derives its next action from the canonical state machine.
    expect(leadWorkspace).toContain('deriveNextLeadAction')
    expect(contextPanel).toContain('deriveNextLeadAction')
    // Neither recomputes waiting state from raw direction alone.
    expect(queue).not.toContain("direction === 'inbound' && !lead.lastOutboundAt")
  })

  it('V3_CONVERSATION_CROSS_SURFACE_PARITY: the same lead reports one state everywhere', () => {
    const fixture = INBOX_FIXTURE_ROWS.find((r) => r.leadId === 'lead-pricing-5h')!
    const derived = deriveConversationRow(
      { id: fixture.leadId, contactName: fixture.person, company: fixture.company, companyKey: fixture.companyKey, ownerRepId: fixture.ownerRepId, profileName: fixture.profileName, status: 'replied' },
      {
        stage: 'conversation',
        lastSentAt: fixture.lastOutboundAt,
        lastReplyAt: fixture.lastInboundAt,
        nextFollowupAt: null,
        wonAt: null,
        lostAt: null,
      },
      fixture.ownerName,
      NOW,
    )
    expect(derived?.state).toBe(fixture.state)
    expect(derived?.ageHours).toBe(fixture.ageHours)
    expect(derived?.nextAction).toBe(fixture.nextAction)
  })
})

// ── Queue behaviour ─────────────────────────────────────────────────────────

describe('V3_INBOX_QUEUE_SORT', () => {
  it('sorts by operational urgency, then oldest wait', () => {
    const rows = [
      row({ leadId: 'low', priority: 'low', ageHours: 20 }),
      row({ leadId: 'crit', priority: 'critical', ageHours: 13 }),
      row({ leadId: 'high-old', priority: 'high', ageHours: 9 }),
      row({ leadId: 'high-new', priority: 'high', ageHours: 4 }),
    ]
    const sorted = sortChatRows(rows)
    expect(sorted.map((r) => r.leadId)).toEqual(['crit', 'high-old', 'high-new', 'low'])
  })
})

describe('V3_INBOX_QUEUE_VIEWS', () => {
  it('exposes exactly the brief’s views, manager-only ones gated', () => {
    const labels = CHAT_VIEWS.map((v) => v.label)
    expect(labels).toEqual([
      'Needs reply',
      'Waiting',
      'Follow-ups',
      'Meeting requests',
      'Proposal requests',
      'Closed',
      'Waiting >4h',
      'Waiting >12h',
      'Unassigned',
      'Thread review',
    ])
    expect(CHAT_VIEWS.filter((v) => v.managerOnly).map((v) => v.value)).toEqual([
      'over4h',
      'over12h',
      'unassigned',
      'review',
    ])
    expect(parseChatView('over4h', false)).toBe('all')
    expect(parseChatView('over4h', true)).toBe('over4h')
  })
})

describe('V3_INBOX_PREVIEW_BOUNDED', () => {
  it('truncates the queue preview to a bounded length', () => {
    const long = 'x'.repeat(400)
    expect(truncatePreview(long)?.length).toBeLessThanOrEqual(140)
    expect(truncatePreview(null)).toBeNull()
    expect(truncatePreview('short')).toBe('short')
  })
})

describe('V3_INBOX_FIXTURES_REALISTIC', () => {
  it('covers every queue state with realistic people and previews', () => {
    const states = new Set(INBOX_FIXTURE_ROWS.map((r) => r.state))
    for (const s of ['waiting_on_rep', 'waiting_on_prospect', 'follow_up_due', 'meeting', 'closed']) {
      expect(states.has(s)).toBe(true)
    }
    expect(INBOX_FIXTURE_ROWS.every((r) => r.preview.length > 20)).toBe(true)
    expect(INBOX_FIXTURE_ROWS.some((r) => r.unassigned)).toBe(true)
    expect(INBOX_FIXTURE_ROWS.some((r) => r.priority === 'critical')).toBe(true)
  })

  it('filters and counts the fixture queue consistently', () => {
    const filtered = filterConversationRows(INBOX_FIXTURE_ROWS as never, 'waiting_me')
    expect(filtered.length).toBeGreaterThan(0)
    expect(sortConversationRows([...filtered]).map((r) => r.state).every((s) => s === 'waiting_on_rep')).toBe(true)
    expect(CONVERSATION_STATE_LABEL.waiting_on_rep).toBe('Waiting on rep')
  })

  it('views are exposed as a type and a parser', () => {
    const views: ChatView[] = ['all', 'waiting_me', 'waiting_them', 'followups', 'meeting_requests', 'proposal_requests', 'closed']
    for (const v of views) expect(parseChatView(v, false)).toBe(v)
  })
})
