/**
 * Inbox V4 rebuild contracts — comprehension, parity and isolation.
 *
 * These pin the product decisions in the workspace rebuild: the queue row and
 * the lead header read one canonical identity, source and state; the composer
 * names the same sending profile as the header; the queue preview is bounded;
 * the thread and context load only for the selected lead; a failed context,
 * task or note section never takes the thread down; AI reasoning, notes and
 * history are collapsed by default; and mobile keeps the queue → thread →
 * details flow.
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ThreadHeader } from '@/components/chats/thread-header'
import { ChatIntelligencePanel } from '@/components/chats/chat-intelligence-panel'
import { Collapsible } from '@/components/chats/collapsible'
import { INBOX_FIXTURE_ROWS, inboxFixtureIntelligence } from '@/lib/operations/inbox-fixtures'
import { truncatePreview } from '@/lib/operations/chat-queue'
import { sourceLabel } from '@/lib/operations/filters'
import { attentionReason, attentionShort } from '@/lib/operations/conversations'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

vi.mock('@/components/operations/intervention-menu', () => ({
  InterventionMenu: () => createElement('button', { type: 'button' }, 'More'),
}))

const ROW = INBOX_FIXTURE_ROWS[0]
const INTEL = inboxFixtureIntelligence(ROW.leadId)

describe('INBOX_LEAD_IDENTITY_PARITY', () => {
  it('the header and the queue row read the same canonical identity fields', () => {
    const html = renderToStaticMarkup(
      createElement(ThreadHeader, {
        row: ROW,
        reps: [],
        canIntervene: false,
        tasksAvailable: false,
      }),
    )
    expect(html).toContain(ROW.person)
    expect(html).toContain(ROW.title!)
    expect(html).toContain(ROW.company!)
    expect(html).toContain(`Owner: <span class="text-graphite">${ROW.ownerName}</span>`)
    expect(html).toContain(`Profile: <span class="text-graphite">${ROW.profileName}</span>`)
  })

  it('the right pane does not repeat owner or profile (header owns identity)', () => {
    const html = renderToStaticMarkup(
      createElement(ChatIntelligencePanel, {
        intel: INTEL,
        reps: [],
        canIntervene: false,
        tasksAvailable: false,
      }),
    )
    expect(html).not.toContain('Owner:')
    expect(html).not.toContain('Profile:')
    expect(html).toContain('Stage')
    expect(html).toContain('Score')
    expect(html).toContain('Intent')
  })
})

describe('INBOX_SOURCE_PARITY', () => {
  it('queue row, lead and history derive one label from the stored source', () => {
    expect(sourceLabel(ROW.sourceRaw)).toBe(sourceLabel(INTEL.sourceRaw))
    expect(sourceLabel('linkedin')).toBe('LinkedIn')
    expect(sourceLabel('upwork')).toBe('Upwork')
    expect(sourceLabel('email')).toBe('Email')
    expect(sourceLabel(null)).toBe('Source not recorded')
    expect(sourceLabel('mystery')).toBe('Source not recorded')
  })

  it('the header renders the source label and the loader reads the stored source', () => {
    const header = renderToStaticMarkup(
      createElement(ThreadHeader, { row: ROW, reps: [], canIntervene: false, tasksAvailable: false }),
    )
    expect(header).toContain(sourceLabel(ROW.sourceRaw))
    const loader = read('src/lib/operations/chat-queue.ts')
    expect(loader).toContain('source: sourceBucket(lead.source)')
    expect(loader).toContain('sourceRaw: lead.source')
  })
})

describe('INBOX_STATE_PARITY', () => {
  it('the queue row, header and context pane read the canonical conversation state', () => {
    const header = renderToStaticMarkup(
      createElement(ThreadHeader, { row: ROW, reps: [], canIntervene: false, tasksAvailable: false }),
    )
    const panel = renderToStaticMarkup(
      createElement(ChatIntelligencePanel, { intel: INTEL, reps: [], canIntervene: false, tasksAvailable: false }),
    )
    expect(attentionShort(ROW)).toBe(`Client replied ${ROW.ageHours}h ago`)
    expect(header).toContain('Waiting on rep')
    expect(panel).toContain(INTEL.conversation!.nextAction)
    // Both derive from deriveConversationRow — no separate formula.
    const loader = read('src/lib/operations/chat-intelligence.ts')
    expect(loader).toContain('deriveConversationRow')
  })

  it('the why-attention reason is canonical, not AI reasoning', () => {
    expect(attentionReason(ROW)).toBe(`Client replied ${ROW.ageHours}h ago. No reply has been sent since.`)
    expect(attentionReason({ state: 'follow_up_due', ageHours: 5 })).toBe('Follow-up due. Last outbound was 5h ago.')
    expect(attentionReason({ state: 'waiting_on_prospect', ageHours: 9 })).toBe('Waiting on the client. Last outbound was 9h ago.')
    expect(attentionReason({ state: 'closed', ageHours: null })).toBe('This conversation is closed. No action needed.')
    const source = read('src/lib/operations/conversations.ts')
    expect(source).toContain('export function attentionReason')
  })
})

describe('INBOX_SENDER_PROFILE_PARITY', () => {
  it('the composer, header and intelligence read the same profile name', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain('sendingProfile={intel?.profileName ?? headerRow.profileName}')
    const header = renderToStaticMarkup(
      createElement(ThreadHeader, { row: ROW, reps: [], canIntervene: false, tasksAvailable: false }),
    )
    expect(header).toContain(ROW.profileName!)
    const loader = read('src/lib/operations/chat-intelligence.ts')
    expect(loader).toContain('revenue_identities')
    expect(loader).toContain('identity_name')
  })
})

describe('INBOX_QUEUE_PREVIEW_BOUNDED', () => {
  it('previews are truncated to 140 characters', () => {
    expect(truncatePreview('a'.repeat(200))!).toHaveLength(140)
    expect(truncatePreview('a'.repeat(200))!.endsWith('…')).toBe(true)
    expect(truncatePreview('short')).toBe('short')
    expect(truncatePreview(null)).toBeNull()
  })

  it('the queue loads previews for the visible page only, capped at 200 rows', () => {
    const loader = read('src/lib/operations/chat-queue.ts')
    expect(loader).toContain('loadLatestPreviews(client, page.map((r) => r.leadId)')
    expect(loader).toContain('Math.min(Math.max(query.limit ?? 60, 1), 200)')
  })
})

describe('INBOX_THREAD_SELECTED_ONLY', () => {
  it('intelligence is loaded for the selected lead only, never by the queue', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain('getIntelligence(leadId)')
    expect(page).toContain('loadChatIntelligence')
    const queue = read('src/lib/operations/chat-queue.ts')
    expect(queue).not.toContain('loadChatIntelligence')
  })
})

describe('INBOX_CONTEXT_FAILURE_ISOLATED', () => {
  it('a missing context pane still renders the thread when the row exists', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain('if (!intel && !row)')
    expect(page).toContain('Lead context could not be loaded. The conversation is still available.')
  })
})

describe('INBOX_TASK_FAILURE_ISOLATED', () => {
  it('unavailable tasks render a sentence and never throw', () => {
    const html = renderToStaticMarkup(
      createElement(ChatIntelligencePanel, {
        intel: { ...INTEL, openTasks: null },
        reps: [],
        canIntervene: false,
        tasksAvailable: false,
      }),
    )
    expect(html).toContain('Tasks could not be loaded.')
    expect(html).toContain('Stage')
  })
})

describe('INBOX_AI_REASONING_COLLAPSED', () => {
  it('the composer hides the rationale behind a collapsed "Why this reply?"', () => {
    const composer = read('src/components/conversation/lead-conversation.tsx')
    expect(composer).toContain('label="Why this reply?"')
    expect(composer).not.toContain('This message aims to')
    const html = renderToStaticMarkup(
      createElement(Collapsible, { label: 'Why this reply?' }, createElement('p', null, 'Goal: hidden until opened')),
    )
    expect(html).toContain('Why this reply?')
    expect(html).not.toContain('Goal: hidden until opened')
  })
})

describe('INBOX_NOTES_COLLAPSED_BY_DEFAULT', () => {
  it('notes and history mount only when opened', () => {
    const panel = read('src/components/chats/chat-intelligence-panel.tsx')
    expect(panel).toContain('label="Internal notes"')
    expect(panel).toContain('count={intel.noteCount}')
    expect(panel).toContain('label="Lead history"')
    const html = renderToStaticMarkup(
      createElement(Collapsible, { label: 'Internal notes', count: 2 }, createElement('p', null, 'Note body')),
    )
    expect(html).toContain('Internal notes')
    expect(html).toContain('>2</span>')
    expect(html).not.toContain('Note body')
  })
})

describe('INBOX_MOBILE_QUEUE_THREAD_FLOW', () => {
  it('mobile is queue → thread → details drawer, never three panes', () => {
    const page = read('src/app/(app)/chats/page.tsx')
    expect(page).toContain("leadId && 'hidden md:block'")
    expect(page).toContain("!leadId && 'hidden md:block'")
    expect(page).toContain('All conversations')
    expect(page).toContain('hidden min-h-0 min-w-0 overflow-y-auto rounded-lg border border-line bg-bone-raised xl:block')
    const drawer = read('src/components/chats/intelligence-drawer.tsx')
    expect(drawer).toContain('Details')
    expect(drawer).toContain('xl:hidden')
  })
})
