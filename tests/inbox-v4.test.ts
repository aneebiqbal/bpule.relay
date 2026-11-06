/**
 * Inbox V4 workspace contracts — the rebuilt /chats shell.
 * Business rules (waiting state, intent, follow-up policy) are unchanged and
 * covered elsewhere; these pin the workspace structure and role behaviour.
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ThreadHeader } from '@/components/chats/thread-header'
import { CHAT_VIEWS, chatViewMatches, parseChatView, type ChatRow } from '@/lib/operations/chat-queue'
import { INBOX_PRIMARY_VIEWS, INBOX_SECONDARY_CONDITIONS, inboxDefaultView } from '@/lib/navigation/inbox-nav'
import {
  resolveSecondaryActiveId,
  secondaryItems,
  type RelayNavRoleFlags,
} from '@/lib/navigation/relay-shell-nav'
import { INBOX_FIXTURE_ROWS } from '@/lib/operations/inbox-fixtures'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const repRole: RelayNavRoleFlags = { isOwner: false, isAdmin: false, isManager: false }
const adminRole: RelayNavRoleFlags = { isOwner: false, isAdmin: true, isManager: true }

// InterventionMenu owns a dialog + router; the header only needs to show it.
vi.mock('@/components/operations/intervention-menu', () => ({
  InterventionMenu: () => createElement('button', { type: 'button' }, 'Act'),
}))

function row(over: Partial<ChatRow> = {}): ChatRow {
  return {
    leadId: 'l1',
    person: 'Sarah Chen',
    company: 'Acme',
    companyKey: 'acme',
    ownerRepId: 'r1',
    ownerName: 'Mehak',
    profileName: 'Mehak LinkedIn',
    state: 'waiting_on_rep',
    stageLabel: 'conversation',
    lastInboundAt: '2026-11-03T04:00:00.000Z',
    lastOutboundAt: '2026-11-02T08:00:00.000Z',
    waitingOn: 'Rep',
    ageHours: 5,
    nextAction: 'Reply',
    href: '/chats?lead=l1',
    title: 'VP Engineering',
    source: 'linkedin',
    profileId: 'p1',
    clientIntent: 'pricing',
    preview: 'Can you send pricing for the MVP?',
    previewFrom: 'client',
    needsReview: false,
    unassigned: false,
    priority: 'high',
    ...over,
  }
}

describe('INBOX_V4_THREAD_HEADER', () => {
  it('shows who, the waiting state, owner and sending profile from the queue row', () => {
    const html = renderToStaticMarkup(
      createElement(ThreadHeader, { row: row(), reps: [], canIntervene: false, tasksAvailable: false }),
    )
    expect(html).toContain('Sarah Chen')
    expect(html).toContain('Waiting on rep')
    expect(html).toContain('5h')
    expect(html).toContain('Owner: ')
    expect(html).toContain('Mehak')
    expect(html).toContain('Profile: ')
    expect(html).toContain('Mehak LinkedIn')
    expect(html).toContain('Open lead')
  })

  it('exposes manager interventions only when the role allows it', () => {
    const html = renderToStaticMarkup(
      createElement(ThreadHeader, {
        row: row(),
        reps: [{ id: 'r1', name: 'Mehak' }],
        canIntervene: true,
        tasksAvailable: true,
      }),
    )
    expect(html).toContain('Act')
  })

  it('an unassigned lead says so plainly', () => {
    const html = renderToStaticMarkup(
      createElement(ThreadHeader, {
        row: row({ ownerName: null, profileName: null, ownerRepId: null, profileId: null }),
        reps: [],
        canIntervene: false,
        tasksAvailable: false,
      }),
    )
    expect(html).toContain('Unassigned')
    expect(html).toContain('Not assigned')
  })
})

describe('INBOX_VISIBLE_NAV_PARITY', () => {
  it('the page tabs and the shell config render the same four primary views', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    const nav = read('src/lib/navigation/relay-shell-nav.ts')
    expect(page).toContain('INBOX_PRIMARY_VIEWS')
    expect(nav).toContain('INBOX_PRIMARY_VIEWS')
    expect(INBOX_PRIMARY_VIEWS.map((v) => v.value)).toEqual(['waiting_me', 'waiting_them', 'followups', 'all'])
    expect(INBOX_PRIMARY_VIEWS.map((v) => v.label)).toEqual(['Needs reply', 'Waiting', 'Follow-ups', 'All'])
    expect(secondaryItems('inbox', repRole).map((i) => i.href)).toEqual(
      INBOX_PRIMARY_VIEWS.map((v) => `/chats?view=${v.value}`),
    )
  })

  it('primary + secondary covers every canonical view exactly once', () => {
    const all = [...INBOX_PRIMARY_VIEWS.map((v) => v.value), ...INBOX_SECONDARY_CONDITIONS.map((v) => v.value)]
    expect(new Set(all).size).toBe(all.length)
    expect([...all].sort()).toEqual([...CHAT_VIEWS.map((v) => v.value), 'all'].sort())
  })
})

describe('INBOX_SECONDARY_FILTER_PARITY', () => {
  it('every secondary condition is a canonical view reachable through Filters', () => {
    const values = INBOX_SECONDARY_CONDITIONS.map((v) => v.value)
    expect(values).toEqual(['meeting_requests', 'proposal_requests', 'closed', 'over4h', 'over12h', 'unassigned', 'review'])
    for (const value of values) expect(parseChatView(value, true)).toBe(value)
    // Legacy aliases keep resolving to the same canonical conditions.
    expect(parseChatView('meeting', true)).toBe('meeting_requests')
    expect(parseChatView('proposal', true)).toBe('proposal_requests')
    expect(parseChatView('thread-review', true)).toBe('review')
    expect(parseChatView('needs-reply', false)).toBe('waiting_me')
  })

  it('the page derives its Filters conditions from the canonical set', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain('INBOX_SECONDARY_CONDITIONS')
    expect(page).not.toContain("value: 'meeting_requests', label: 'Meeting requests'")
  })

  it('primary tabs and secondary conditions return the same rows as the canonical matcher', () => {
    const rows = INBOX_FIXTURE_ROWS
    const views = [...INBOX_PRIMARY_VIEWS.map((p) => p.value), ...INBOX_SECONDARY_CONDITIONS.map((s) => s.value)]
    for (const value of views) {
      expect(rows.filter((r) => chatViewMatches(r, value)).length, value).toBeGreaterThan(0)
    }
  })
})

describe('INBOX_ROLE_DEFAULT_PARITY', () => {
  it('reps default to Needs reply and managers to All, in both the page and the resolver', () => {
    expect(inboxDefaultView(false)).toBe('waiting_me')
    expect(inboxDefaultView(true)).toBe('all')
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain('inboxDefaultView(managerViews)')
    expect(resolveSecondaryActiveId('inbox', '/chats', new URLSearchParams(''), repRole)).toBe('needs-reply')
    expect(resolveSecondaryActiveId('inbox', '/chats', new URLSearchParams(''), adminRole)).toBe('all')
  })
})

describe('INBOX_ACTIVE_STATE_SINGLETON', () => {
  it('resolves exactly one active Inbox item (or none for a condition) across the route matrix', () => {
    const matrix: Array<[string, string, RelayNavRoleFlags]> = [
      ['/chats', '', repRole],
      ['/chats', 'view=waiting_me', repRole],
      ['/chats', 'view=waiting_them', repRole],
      ['/chats', 'view=followups', repRole],
      ['/chats', 'view=all', repRole],
      ['/chats', 'view=waiting_me', adminRole],
      ['/chats', 'lead=abc', repRole],
      ['/chats', 'view=over12h', adminRole],
    ]
    for (const [pathname, query, role] of matrix) {
      const active = resolveSecondaryActiveId('inbox', pathname, new URLSearchParams(query), role)
      if (active === null) continue
      expect(secondaryItems('inbox', role).filter((i) => i.id === active), pathname).toHaveLength(1)
    }
  })
})

describe('INBOX_V4_PROFILE_VISIBILITY', () => {
  it('the composer names the sending profile and links to assign one when missing', () => {
    const page = read('src/components/conversation/lead-conversation.tsx')
    expect(page).toContain('Sending as')
    expect(page).toContain('No sending profile')
    expect(page).toContain('/team/profiles')
  })
})

describe('INBOX_DEFAULT_URL_NORMALIZATION', () => {
  it('writes the role default into the URL with a client-side replace', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    const behavior = read('src/components/chats/auto-select-conversation.tsx')
    expect(page).toContain('defaultView={inboxDefaultView(managerViews)}')
    expect(behavior).toContain('router.replace(')
    expect(behavior).toContain("params.set('view', defaultView)")
    expect(behavior).not.toContain('window.location.reload')
  })
})
