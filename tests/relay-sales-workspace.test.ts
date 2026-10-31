import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Lead } from '@/lib/domain/types'
import {
  LEADS_MAX_PAGE_SIZE,
  LEADS_VIEWS,
  derivePipelineStage,
  isPipelineStage,
  leadDue,
  leadIntentLevel,
  leadNextAction,
  leadPriority,
  leadStuckSignals,
  STAGE_LABELS,
  STUCK_SIGNAL_LABELS,
  parseLeadsQuery,
  sortLeadRows,
  viewToQuery,
  type LeadRow,
} from '@/components/leads/pipeline-utils'
import {
  IntentBadge,
  PriorityBadge,
  ProfileCell,
} from '@/components/leads/leads-table'
import { DataTable, type Column } from '@/components/ui/data-table'
import { scopeLeadsToWorkspace } from '@/lib/leads/board-rows'

function lead(
  partial: Partial<Lead> & Pick<Lead, 'id' | 'company' | 'status' | 'createdAt'>,
): LeadRow {
  return {
    organizationId: 'org-1',
    ownerRepId: 'rep-1',
    companyKey: partial.company.toLowerCase(),
    contactName: null,
    contactTitle: null,
    url: null,
    rawInput: null,
    signalType: null,
    signalEvidence: null,
    verbatimQuote: null,
    score: null,
    verdict: null,
    playId: null,
    tags: [],
    ...partial,
  } as LeadRow
}

const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(node)

describe('LEADS_PROFILE_SCOPE', () => {
  it('LEADS_PROFILE_SCOPE: scopes rows to the selected profile identity', () => {
    const rows = [
      lead({ id: 'a', company: 'Acme', status: 'new', createdAt: '2026-01-01T00:00:00Z', revenueIdentityId: 'id-1' }),
      lead({ id: 'b', company: 'Beta', status: 'new', createdAt: '2026-01-01T00:00:00Z', revenueIdentityId: 'id-2' }),
    ]
    const scoped = scopeLeadsToWorkspace(
      rows,
      { id: 'id-1', identityName: 'Mehak Seedat', title: null, channel: 'linkedin', profileId: null },
      false,
    )
    expect(scoped.map((row) => row.id)).toEqual(['a'])
  })

  it('LEADS_PROFILE_SCOPE: an admin keeps the whole organisation', () => {
    const rows = [
      lead({ id: 'a', company: 'Acme', status: 'new', createdAt: '2026-01-01T00:00:00Z', revenueIdentityId: 'id-1' }),
      lead({ id: 'b', company: 'Beta', status: 'new', createdAt: '2026-01-01T00:00:00Z', revenueIdentityId: 'id-2' }),
    ]
    expect(scopeLeadsToWorkspace(rows, null, true)).toHaveLength(2)
  })

  it('LEADS_PROFILE_SCOPE: no resolvable workspace keeps the book rather than an empty board', () => {
    const rows = [lead({ id: 'a', company: 'Acme', status: 'new', createdAt: '2026-01-01T00:00:00Z' })]
    expect(scopeLeadsToWorkspace(rows, null, false)).toHaveLength(1)
  })
})

describe('LEADS_PAGINATION', () => {
  it('LEADS_PAGINATION: page size is clamped and pages never go below one', () => {
    expect(parseLeadsQuery({ pageSize: '5000' }).pageSize).toBe(LEADS_MAX_PAGE_SIZE)
    expect(parseLeadsQuery({ pageSize: '0' }).pageSize).toBe(50)
    expect(parseLeadsQuery({ page: '-3' }).page).toBe(1)
  })

  it('LEADS_PAGINATION: pages tile the whole set — every record is reachable', () => {
    const rows = Array.from({ length: 250 }, (_, index) =>
      lead({
        id: `l${index}`,
        company: `Company ${index}`,
        status: 'new',
        createdAt: new Date(Date.parse('2026-01-01T00:00:00Z') - index * 1000).toISOString(),
      }),
    )
    const pageSize = 50
    const seen = new Set<string>()
    const pageCount = Math.ceil(rows.length / pageSize)
    for (let page = 1; page <= pageCount; page += 1) {
      const sorted = sortLeadRows(rows, 'recent', 'desc')
      for (const row of sorted.slice((page - 1) * pageSize, page * pageSize)) seen.add(row.id)
    }
    expect(seen.size).toBe(250)
  })

  it('LEADS_PAGINATION: the sort is stable and reversible', () => {
    const rows = [
      lead({ id: 'a', company: 'Beta', status: 'new', createdAt: '2026-01-01T00:00:00Z' }),
      lead({ id: 'b', company: 'Alpha', status: 'new', createdAt: '2026-01-01T00:00:00Z' }),
      lead({ id: 'c', company: 'Gamma', status: 'new', createdAt: '2026-01-01T00:00:00Z' }),
    ]
    const asc = sortLeadRows(rows, 'company', 'asc').map((row) => row.id)
    const desc = sortLeadRows(rows, 'company', 'desc').map((row) => row.id)
    expect(asc).toEqual(['b', 'a', 'c'])
    expect(desc).toEqual([...asc].reverse())
  })
})

describe('LEADS_SEARCH', () => {
  it('LEADS_SEARCH: trims the query and drops an empty one', () => {
    expect(parseLeadsQuery({ q: '  acme  ' }).q).toBe('acme')
    expect(parseLeadsQuery({ q: '   ' }).q).toBeUndefined()
    expect(parseLeadsQuery({}).q).toBeUndefined()
  })
})

describe('LEADS_SAVED_VIEWS', () => {
  it('LEADS_SAVED_VIEWS: every view maps to a canonical preset', () => {
    expect(viewToQuery('needs_reply')).toEqual({ stage: 'needs_reply' })
    expect(viewToQuery('follow_ups')).toEqual({ stage: 'follow_up_due' })
    expect(viewToQuery('new')).toEqual({ status: 'new' })
    expect(viewToQuery('watch')).toEqual({ stage: 'observe' })
    expect(viewToQuery('won')).toEqual({ status: 'won' })
    expect(viewToQuery('all')).toEqual({})
  })

  it('LEADS_SAVED_VIEWS: unknown views fall back to All', () => {
    expect(isPipelineStage('everything')).toBe(false)
    expect(parseLeadsQuery({ view: 'everything' }).stage).toBeUndefined()
  })

  it('LEADS_SAVED_VIEWS: explicit filters win over the preset', () => {
    expect(parseLeadsQuery({ view: 'needs_reply', q: 'acme' })).toMatchObject({
      stage: 'needs_reply',
      q: 'acme',
    })
  })

  it('LEADS_SAVED_VIEWS: the view list is non-empty and unique', () => {
    const ids = LEADS_VIEWS.map((view) => view.id)
    expect(ids.length).toBeGreaterThan(1)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('LEADS_NEXT_ACTION', () => {
  it('LEADS_NEXT_ACTION: the canonical action follows the canonical stage', () => {
    const row = lead({
      id: 'r',
      company: 'Acme',
      status: 'replied',
      createdAt: '2026-01-01T00:00:00Z',
      lastOutboundAt: '2026-01-01T00:00:00Z',
      lastInboundAt: '2026-01-02T00:00:00Z',
    })
    expect(derivePipelineStage(row)).toBe('needs_reply')
    expect(leadNextAction(row)).toEqual({ label: 'Reply', href: '/leads/r?tab=conversation' })
  })

  it('LEADS_NEXT_ACTION: a connection-accepted lead still needs a first message', () => {
    const row = lead({
      id: 'c',
      company: 'Acme',
      status: 'contacted',
      createdAt: '2026-01-01T00:00:00Z',
      connectionAcceptedAt: '2026-01-03T00:00:00Z',
    })
    expect(derivePipelineStage(row)).toBe('to_contact')
    expect(leadNextAction(row).label).toBe('Send first message')
  })

  it('LEADS_NEXT_ACTION: an observe lead is told to research, never to pitch', () => {
    const row = lead({ id: 'o', company: 'Acme', status: 'new', createdAt: '2026-01-01T00:00:00Z', verdict: 'skip' })
    expect(derivePipelineStage(row)).toBe('observe')
    expect(leadNextAction(row).label).toBe('Research')
  })
})

describe('LEADS_PRIORITY', () => {
  it('LEADS_PRIORITY: priority is canonical language, not a raw score band', () => {
    const critical = lead({
      id: 'a',
      company: 'Acme',
      status: 'replied',
      createdAt: '2026-01-01T00:00:00Z',
      lastOutboundAt: '2026-01-01T00:00:00Z',
      lastInboundAt: '2026-01-02T00:00:00Z',
      score: 2,
      canonicalScore: 2,
    })
    expect(leadPriority(critical)).toBe('critical')
    expect(render(createElement(PriorityBadge, { priority: 'critical' }))).toContain('Critical')
  })

  it('LEADS_PRIORITY: an observe lead is Watch, not a low score', () => {
    const row = lead({ id: 'o', company: 'Acme', status: 'new', createdAt: '2026-01-01T00:00:00Z', verdict: 'skip' })
    expect(leadPriority(row)).toBe('watch')
  })
})

describe('LEADS_PROFILE_ATTRIBUTION', () => {
  it('LEADS_PROFILE_ATTRIBUTION: a lead with no sender says so plainly', () => {
    const html = render(
      createElement(ProfileCell, {
        lead: lead({ id: 'a', company: 'Acme', status: 'new', createdAt: '2026-01-01T00:00:00Z' }),
      }),
    )
    expect(html).toContain('Not assigned')
  })

  it('LEADS_PROFILE_ATTRIBUTION: the sender profile is always shown', () => {
    const html = render(
      createElement(ProfileCell, {
        lead: lead({
          id: 'a',
          company: 'Acme',
          status: 'new',
          createdAt: '2026-01-01T00:00:00Z',
          senderProfileName: 'Mehak Seedat',
        }),
      }),
    )
    expect(html).toContain('Mehak Seedat')
  })
})

describe('TABLE_RESPONSIVE_MODEL', () => {
  it('TABLE_RESPONSIVE_MODEL: desktop table and mobile cards are both rendered', () => {
    const columns: Column<LeadRow>[] = [
      { key: 'lead', header: 'Lead', render: (row) => row.company },
    ]
    const html = render(
      createElement(DataTable, {
        columns,
        rows: [lead({ id: 'a', company: 'Acme', status: 'new', createdAt: '2026-01-01T00:00:00Z' })],
        rowKey: (row) => row.id,
        renderCard: (row) => createElement('div', null, row.company),
      }),
    )
    expect(html).toContain('hidden md:block')
    expect(html).toContain('md:hidden')
    expect(html).toContain('Acme')
  })

  it('TABLE_RESPONSIVE_MODEL: hidden columns collapse below their breakpoint', () => {
    const columns: Column<LeadRow>[] = [
      { key: 'lead', header: 'Lead', render: (row) => row.company },
      { key: 'owner', header: 'Owner', hideBelow: 'xl', render: () => 'Madiha' },
    ]
    const html = render(
      createElement(DataTable, {
        columns,
        rows: [lead({ id: 'a', company: 'Acme', status: 'new', createdAt: '2026-01-01T00:00:00Z' })],
        rowKey: (row) => row.id,
      }),
    )
    expect(html).toContain('hidden xl:table-cell')
  })
})

describe('PIPELINE_STUCK_SIGNALS', () => {
  it('PIPELINE_STUCK_SIGNALS: flags only canonical state, never a local stage', () => {
    const replied = lead({
      id: 'r',
      company: 'Acme',
      status: 'replied',
      createdAt: '2026-01-01T00:00:00Z',
      lastOutboundAt: '2026-01-01T00:00:00Z',
      lastInboundAt: '2026-01-02T00:00:00Z',
      senderProfileName: 'Mehak Seedat',
    })
    expect(leadStuckSignals(replied)).toEqual(['reply_waiting'])

    const noProfile = lead({
      id: 'n',
      company: 'Beta',
      status: 'new',
      createdAt: '2026-01-01T00:00:00Z',
    })
    expect(leadStuckSignals(noProfile)).toContain('no_profile')
    expect(leadStuckSignals(noProfile)).toContain('no_next_action')

    const healthy = lead({
      id: 'h',
      company: 'Gamma',
      status: 'contacted',
      createdAt: '2026-01-01T00:00:00Z',
      lastOutboundAt: '2026-01-05T00:00:00Z',
      senderProfileName: 'Mehak Seedat',
    })
    expect(leadStuckSignals(healthy)).not.toContain('reply_waiting')
    expect(STUCK_SIGNAL_LABELS.followup_overdue).toBe('Follow-up overdue')
  })
})

describe('LEADS_PERFORMANCE', () => {
  it('LEADS_PERFORMANCE: the table is server-paginated, never client-sliced', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const loader = readFileSync(join(root, 'src/lib/leads/leads-page.ts'), 'utf8')
    const table = readFileSync(join(root, 'src/components/leads/leads-table.tsx'), 'utf8')
    expect(loader).toContain('listLeadsPage')
    expect(loader).toContain('enrichLeads')
    expect(table).not.toMatch(/\.slice\(0,\s*visibleCount\)/)
    expect(table).not.toMatch(/PAGE_SIZE/)
  })

  it('LEADS_PERFORMANCE: enrichment is chunked so no giant in(...) request', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const board = readFileSync(join(root, 'src/lib/leads/board-rows.ts'), 'utf8')
    expect(board).toContain('chunkedIn')
  })
})

describe('TABLE_ACCESSIBILITY', () => {
  it('TABLE_ACCESSIBILITY: headers expose sort state and rows are keyboard operable', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const source = readFileSync(join(root, 'src/components/ui/data-table.tsx'), 'utf8')
    expect(source).toContain('aria-sort')
    expect(source).toContain('tabIndex')
    expect(source).toContain('event.key === "Enter"')
  })
})

describe('LEADS_CROSS_SURFACE_PARITY', () => {
  it('LEADS_CROSS_SURFACE_PARITY: one stage vocabulary across the table and the pipeline', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const table = readFileSync(join(root, 'src/components/leads/leads-table.tsx'), 'utf8')
    const board = readFileSync(join(root, 'src/components/leads/leads-board-v2.tsx'), 'utf8')
    for (const source of [table, board]) {
      expect(source).toContain('STAGE_LABELS')
      expect(source).not.toMatch(/label:\s*'To Contact'/)
    }
    expect(STAGE_LABELS.to_contact).toBe('Qualified')
    expect(STAGE_LABELS.needs_reply).toBe('Conversation')
  })

  it('LEADS_CROSS_SURFACE_PARITY: stage, priority, next action and intent read one row', () => {
    const row = lead({
      id: 'a',
      company: 'Acme',
      status: 'replied',
      createdAt: '2026-01-01T00:00:00Z',
      lastOutboundAt: '2026-01-01T00:00:00Z',
      lastInboundAt: '2026-01-02T00:00:00Z',
      senderProfileName: 'Mehak Seedat',
      buyerIntent: { buyerIntentLevel: 'HIGH' },
      canonicalScore: 8,
    })
    expect(derivePipelineStage(row)).toBe('needs_reply')
    expect(leadPriority(row)).toBe('critical')
    expect(leadNextAction(row).label).toBe('Reply')
    expect(leadIntentLevel(row)).toBe('HIGH')
    expect(row.senderProfileName).toBe('Mehak Seedat')
  })
})

describe('PIPELINE_STAGE_PARITY', () => {
  it('PIPELINE_STAGE_PARITY: stage, priority and next action agree on one row', () => {
    const row = lead({
      id: 'a',
      company: 'Acme',
      status: 'replied',
      createdAt: '2026-01-01T00:00:00Z',
      lastOutboundAt: '2026-01-01T00:00:00Z',
      lastInboundAt: '2026-01-02T00:00:00Z',
    })
    expect(derivePipelineStage(row)).toBe('needs_reply')
    expect(leadPriority(row)).toBe('critical')
    expect(leadNextAction(row).label).toBe('Reply')
  })

  it('PIPELINE_STAGE_PARITY: terminal statuses are never in the live pipeline', () => {
    for (const status of ['won', 'lost', 'dead', 'no'] as const) {
      expect(
        derivePipelineStage(
          lead({ id: status, company: 'Acme', status, createdAt: '2026-01-01T00:00:00Z' }),
        ),
      ).toBe('done')
    }
  })
})

describe('LEADS_DUE', () => {
  it('LEADS_DUE: follows the canonical follow-up clock', () => {
    const now = Date.parse('2026-02-01T12:00:00Z')
    const row = lead({
      id: 'a',
      company: 'Acme',
      status: 'contacted',
      createdAt: '2026-01-01T00:00:00Z',
      lastOutboundAt: '2026-01-20T12:00:00Z',
      followupCount: 0,
    })
    const due = leadDue(row, now)
    expect(due).not.toBeNull()
    expect(due?.overdue).toBe(true)
    expect(due?.label).toBe('Due now')
  })

  it('LEADS_DUE: a not-yet-due follow-up shows the remaining time', () => {
    const now = Date.parse('2026-01-21T12:00:00Z')
    const row = lead({
      id: 'a',
      company: 'Acme',
      status: 'contacted',
      createdAt: '2026-01-01T00:00:00Z',
      lastOutboundAt: '2026-01-20T12:00:00Z',
      followupCount: 0,
    })
    const due = leadDue(row, now)
    expect(due).not.toBeNull()
    expect(due?.overdue).toBe(false)
    expect(due?.label).toMatch(/^\d+[mhd]$/)
  })

  it('LEADS_DUE: a lead with no outbound has no due date', () => {
    const row = lead({ id: 'a', company: 'Acme', status: 'new', createdAt: '2026-01-01T00:00:00Z' })
    expect(leadDue(row, Date.parse('2026-02-01T12:00:00Z'))).toBeNull()
  })
})

describe('LEADS_INTENT', () => {
  it('LEADS_INTENT: buyer intent is separate from the opportunity score', () => {
    const row = lead({
      id: 'a',
      company: 'Acme',
      status: 'new',
      createdAt: '2026-01-01T00:00:00Z',
      canonicalScore: 9,
      buyerIntent: { buyerIntentLevel: 'HIGH' },
    })
    expect(leadIntentLevel(row)).toBe('HIGH')
    expect(render(createElement(IntentBadge, { lead: row }))).toContain('HIGH')
  })

  it('LEADS_INTENT: no buyer-intent evidence renders a dash, never a guess', () => {
    const row = lead({ id: 'a', company: 'Acme', status: 'new', createdAt: '2026-01-01T00:00:00Z' })
    expect(leadIntentLevel(row)).toBeNull()
    expect(render(createElement(IntentBadge, { lead: row }))).toContain('—')
  })
})
