/**
 * Deterministic markup / accessibility guards for Slice C components,
 * rendered on the server (no DOM tooling in this repo). These do not replace
 * the browser pass — responsive behaviour still needs real widths.
 */
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChatQueueList } from '@/components/chats/chat-queue-list'
import { CountTable } from '@/components/reports/report-views'
import { LinkTabs, TimelineTable } from '@/components/operations/ops-primitives'
import type { ChatRow } from '@/lib/operations/chat-queue'

const row = (over: Partial<ChatRow>): ChatRow => ({
  leadId: 'l1', person: 'Sarah Chen', company: 'Acme', companyKey: 'acme', ownerRepId: 'r1', ownerName: 'Mehak',
  profileName: 'Mehak LinkedIn', stageLabel: 'replied', lastInboundAt: null, lastOutboundAt: null, waitingOn: 'Rep',
  ageHours: 1, nextAction: 'Reply', href: '/chats?lead=l1', title: 'VP Engineering', source: 'linkedin', profileId: 'p1',
  clientIntent: null, preview: 'Yes, Thursday works', previewFrom: 'client', needsReview: false, unassigned: false, priority: 'high',
  state: 'waiting_on_rep',
  ...over,
})

describe('ACCESSIBILITY_MARKUP', () => {
  it('chat queue: list semantics, selected row marked, priority as text (not colour only)', () => {
    const html = renderToStaticMarkup(
      createElement(ChatQueueList, {
        rows: [row({}), row({ leadId: 'l2', person: 'Tom', priority: 'critical', needsReview: true })],
        selectedLeadId: 'l2',
        hrefFor: (id: string) => `/chats?lead=${id}`,
        showOwner: true,
        emptyLabel: 'None',
      }),
    )
    expect(html).toContain('aria-label="Conversations"')
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
    expect(html).toContain('href="/chats?lead=l2"')
    expect(html).toContain('<span class="sr-only">Priority: </span>Critical')
    expect(html).toContain('Them: </span>Yes, Thursday works')
    expect(html).toContain('Sender not verified')
    expect(html).toContain('Client replied 1h ago')
  })

  it('chat queue: empty state is a sentence, not a blank pane', () => {
    const html = renderToStaticMarkup(
      createElement(ChatQueueList, { rows: [], selectedLeadId: null, hrefFor: () => '#', showOwner: false, emptyLabel: 'Nothing is waiting on you.' }),
    )
    expect(html).toContain('Nothing is waiting on you.')
  })

  it('report table: caption, scoped headers, unknown counts render as —, change has text', () => {
    const html = renderToStaticMarkup(
      createElement(CountTable, {
        caption: 'Lead progression',
        rows: [
          { key: 'a', label: 'Qualified', count: 10, conversionPct: null, previous: 5, href: '/leads?x=1' },
          { key: 'b', label: 'Contacted', count: null, conversionPct: null, previous: 4, href: null },
        ],
      }),
    )
    expect(html).toContain('<caption class="sr-only">Lead progression</caption>')
    expect(html).toContain('scope="col"')
    expect(html).toContain('scope="row"')
    expect(html).toMatch(/>—<\/td>/)
    expect(html).toContain('<span class="sr-only"> increase</span>')
    expect(html).toContain('href="/leads?x=1"')
  })

  it('URL tabs: navigation landmark with exactly one current page', () => {
    const html = renderToStaticMarkup(
      createElement(LinkTabs, {
        label: 'Conversation views',
        active: 'b',
        tabs: [
          { value: 'a', label: 'Open', href: '/chats', count: 3 },
          { value: 'b', label: 'Waiting on me', href: '/chats?view=waiting_me', count: 1 },
        ],
      }),
    )
    expect(html).toContain('<nav aria-label="Conversation views"')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
  })

  it('timeline: semantic table on desktop and a labelled list on mobile', () => {
    const html = renderToStaticMarkup(
      createElement(TimelineTable, {
        rows: [
          {
            id: 'ae:1', at: '2026-11-01T10:00:00.000Z', actorRepId: 'r1', actorName: 'Mehak', profileName: 'Mehak LinkedIn',
            leadId: 'l1', leadLabel: 'Sarah Chen · Acme', company: 'Acme', companyKey: 'acme', event: 'Follow-up sent',
            category: 'outreach', result: 'LinkedIn', href: '/leads/l1', source: 'linkedin',
          },
        ],
        now: Date.parse('2026-11-01T11:00:00.000Z'),
        empty: 'Nothing',
      }),
    )
    expect(html).toContain('<caption class="sr-only">Activity timeline, newest first</caption>')
    expect(html).toContain('aria-label="Activity timeline, newest first"')
    expect(html).toContain('dateTime="2026-11-01T10:00:00.000Z"')
    expect(html).toContain('hidden overflow-x-auto rounded-lg border border-line md:block')
  })
})
