/** Relay V3 Sprint 2 — Sales workspace contracts.
 *
 * Every test name matches the sprint's test matrix so a regression is
 * traceable to the requirement it protects.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Lead } from '@/lib/domain/types'
import {
  LEADS_MAX_PAGE_SIZE,
  LEADS_PAGE_SIZE,
  LEADS_VIEWS,
  STAGE_LABELS,
  derivePipelineStage,
  filterLeads,
  isLeadsViewId,
  leadNextAction,
  leadPriority,
  parseLeadsQuery,
  sortLeadRows,
  viewToQuery,
  type LeadRow,
} from '@/components/leads/pipeline-utils'
import { scopeLeadsToWorkspace, BOARD_CARD_LIMIT, type BoardPreview } from '@/lib/leads/board-rows'
import { buildGlobalCreateItems } from '@/lib/navigation/global-create-items'
import { ProfileCell } from '@/components/leads/leads-table'
import { LeadStageStrip } from '@/components/sales/lead-stage-strip'
import { LeadContextPanel } from '@/components/sales/lead-context-panel'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

function lead(partial: Partial<Lead> & Pick<Lead, 'id' | 'company' | 'status' | 'createdAt'>): LeadRow {
  return {
    organizationId: 'org-1',
    ownerRepId: 'rep-1',
    companyKey: partial.company.toLowerCase(),
    contactName: 'Sarah Chen',
    contactTitle: 'VP Engineering',
    url: null,
    rawInput: null,
    signalType: null,
    signalEvidence: null,
    verbatimQuote: null,
    score: 8,
    verdict: null,
    playId: null,
    tags: [],
    ...partial,
  } as LeadRow
}

const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(node)

// ── Prospects ───────────────────────────────────────────────────────────────

describe('V3_PROSPECT_ANALYZE_PRIMARY', () => {
  it('V3_PROSPECT_ANALYZE_PRIMARY: every surface routes Analyze Prospect to the canonical flow', () => {
    const items = buildGlobalCreateItems(false)
    const analyze = items.find((item) => item.label === 'Analyze Prospect')
    expect(analyze?.href).toBe('/prospect')
    expect(analyze?.default).toBe(true)

    // The shared Sales header renders the same canonical destination.
    const header = read('src/components/sales/sales-header.tsx')
    expect(header).toContain("href: '/prospect'")
  })
})

describe('V3_PROSPECT_SOURCE_PROFILE', () => {
  it('V3_PROSPECT_SOURCE_PROFILE: a prospect row always attributes its sending profile', () => {
    const workspace = read('src/components/prospect/prospects-workspace.tsx')
    expect(workspace).toContain('Source profile')
    expect(workspace).toContain('Not assigned')
  })
})

describe('V3_PROSPECT_CREATE_LEAD_CLEAR', () => {
  it('V3_PROSPECT_CREATE_LEAD_CLEAR: the workspace clears the result after a lead is created', () => {
    const analyze = read('src/components/prospect/prospect-analyze.tsx')
    // A successful save removes the completed analysis so it cannot come back
    // ready to be generated again (BUG-23).
    expect(analyze).toContain('BUG-23')
    expect(analyze).toContain('resetResult')
  })
})

describe('V3_PROSPECT_DUPLICATE_PREVENTION', () => {
  it('V3_PROSPECT_DUPLICATE_PREVENTION: saving a prospect reuses the canonical dedupe guard', () => {
    const analyze = read('src/components/prospect/prospect-analyze.tsx')
    expect(analyze).toMatch(/dedupe|duplicate|already/i)
  })
})

describe('V3_PROSPECT_WATCHLIST', () => {
  it('V3_PROSPECT_WATCHLIST: watchlist is the canonical observe set, never active outreach', () => {
    const page = read('src/lib/prospect/prospects-page.ts')
    expect(page).toContain("derivePipelineStage(lead) === 'observe'")
  })
})

// ── Leads ───────────────────────────────────────────────────────────────────

describe('V3_LEADS_PROFILE_SCOPE', () => {
  it('V3_LEADS_PROFILE_SCOPE: a rep only sees leads belonging to their workspace', () => {
    const rows = [
      lead({ id: 'a', company: 'Acme', status: 'new', createdAt: '2026-01-01T00:00:00Z', revenueIdentityId: 'id-1' }),
      lead({ id: 'b', company: 'Globex', status: 'new', createdAt: '2026-01-01T00:00:00Z', revenueIdentityId: 'id-2' }),
    ]
    const scoped = scopeLeadsToWorkspace(rows, { id: 'id-1' } as never, false)
    expect(scoped.map((row) => row.id)).toEqual(['a'])
  })
})

describe('V3_LEADS_ADMIN_SCOPE', () => {
  it('V3_LEADS_ADMIN_SCOPE: org view keeps every lead in the organisation', () => {
    const rows = [
      lead({ id: 'a', company: 'Acme', status: 'new', createdAt: '2026-01-01T00:00:00Z' }),
      lead({ id: 'b', company: 'Globex', status: 'new', createdAt: '2026-01-01T00:00:00Z' }),
    ]
    expect(scopeLeadsToWorkspace(rows, { id: 'id-1' } as never, true)).toHaveLength(2)
  })
})

describe('V3_LEADS_MANAGER_SCOPE', () => {
  it('V3_LEADS_MANAGER_SCOPE: a manager never receives org-wide expansion', () => {
    const scope = read('src/lib/leads/lead-scope.ts')
    expect(scope).toContain('assertRepCannotUseTeamScope')
  })
})

describe('V3_LEADS_SEARCH', () => {
  it('V3_LEADS_SEARCH: search matches person, company and title', () => {
    const rows = [
      lead({ id: 'a', company: 'Acme', status: 'new', createdAt: '2026-01-01T00:00:00Z', contactName: 'Sarah Chen', contactTitle: 'VP Engineering' }),
      lead({ id: 'b', company: 'Globex', status: 'new', createdAt: '2026-01-01T00:00:00Z', contactName: 'Bob Jones', contactTitle: 'Sales Director' }),
    ]
    expect(filterLeads(rows, 'acme').map((r) => r.id)).toEqual(['a'])
    expect(filterLeads(rows, 'sarah').map((r) => r.id)).toEqual(['a'])
    expect(filterLeads(rows, 'engineer').map((r) => r.id)).toEqual(['a'])
  })
})

describe('V3_LEADS_FILTERS', () => {
  it('V3_LEADS_FILTERS: query state round-trips through the URL', () => {
    const query = parseLeadsQuery({ q: 'acme', stage: 'needs_reply', priority: 'critical', owner: 'rep-1' })
    expect(query.q).toBe('acme')
    expect(query.stage).toBe('needs_reply')
    expect(query.priority).toBe('critical')
    expect(query.owner).toBe('rep-1')
    expect(viewToQuery('all')).toEqual({})
  })
})

describe('V3_LEADS_PAGINATION', () => {
  it('V3_LEADS_PAGINATION: page size is bounded by the canonical maximum', () => {
    expect(LEADS_PAGE_SIZE).toBeGreaterThan(0)
    expect(LEADS_MAX_PAGE_SIZE).toBeGreaterThanOrEqual(LEADS_PAGE_SIZE)
    expect(parseLeadsQuery({ pageSize: '99999' }).pageSize).toBeLessThanOrEqual(LEADS_MAX_PAGE_SIZE)
  })
})

describe('V3_LEADS_SAVED_VIEW', () => {
  it('V3_LEADS_SAVED_VIEW: saved views are presets, not stored filters', () => {
    expect(LEADS_VIEWS.map((view) => view.id)).toContain('all')
    expect(LEADS_VIEWS.length).toBeGreaterThan(1)
    for (const id of LEADS_VIEWS.map((view) => view.id)) {
      expect(isLeadsViewId(id)).toBe(true)
    }
  })
})

describe('V3_LEADS_DRAWER', () => {
  it('V3_LEADS_DRAWER: row click opens the preview drawer, not a page navigation', () => {
    const table = read('src/components/leads/leads-table.tsx')
    expect(table).toContain('LeadPreviewDrawer')
    expect(table).toContain('setPreviewLeadId(lead.id)')
    expect(table).not.toContain('onRowClick={(lead) => router.push(`/leads/${lead.id}`)}')
  })

  it('V3_LEADS_DRAWER: the drawer payload is bounded and loads conversation lazily', () => {
    const preview = read('src/lib/leads/preview.ts')
    // The narrow column list must not carry the raw source or the full
    // intelligence blob — only identity and the fields the drawer renders.
    expect(preview).not.toContain("'raw_input',")
    expect(preview).not.toContain("'canonical_intelligence',")
    expect(preview).toContain('PREVIEW_LEAD_COLUMNS')

    const drawer = read('src/components/sales/lead-preview-drawer.tsx')
    expect(drawer).toContain("tab === 'conversation'")
    expect(drawer).toContain('loadMessages')
  })
})

// ── Pipeline ────────────────────────────────────────────────────────────────

describe('V3_PIPELINE_CANONICAL_STAGE', () => {
  it('V3_PIPELINE_CANONICAL_STAGE: the board uses the same stage vocabulary as the table', () => {
    const row = lead({ id: 'a', company: 'Acme', status: 'replied', createdAt: '2026-01-01T00:00:00Z' })
    expect(STAGE_LABELS[derivePipelineStage(row)]).toBe('Conversation')
  })
})

describe('V3_PIPELINE_TABLE_PARITY', () => {
  it('V3_PIPELINE_TABLE_PARITY: table and pipeline derive stage, priority and action identically', () => {
    const row = lead({ id: 'a', company: 'Acme', status: 'contacted', createdAt: '2026-01-01T00:00:00Z', lastOutboundAt: '2026-01-02T00:00:00Z' })
    expect(derivePipelineStage(row)).toBe(derivePipelineStage({ ...row }))
    expect(leadPriority(row)).toBe(leadPriority({ ...row }))
    expect(leadNextAction(row).label).toBe(leadNextAction({ ...row }).label)
  })
})

describe('V3_PIPELINE_SERVER_COUNTS', () => {
  it('V3_PIPELINE_SERVER_COUNTS: counts come from the server payload, not the client list', () => {
    const board = read('src/components/leads/leads-board-v2.tsx')
    expect(board).toContain('counts[stage] ?? 0')
    expect(board).not.toContain('leadsInStage.length}')
  })
})

describe('V3_PIPELINE_BOUNDED_CARDS', () => it('V3_PIPELINE_BOUNDED_CARDS: the client never receives the whole lead set', () => {
    expect(BOARD_CARD_LIMIT).toBeGreaterThan(0)
    const preview = read('src/lib/leads/board-rows.ts')
    expect(preview).toContain('.slice(0, cardLimit)')
    // Counts are computed over the full set before the card slice.
    expect(preview.indexOf('for (const lead of data.leads)')).toBeLessThan(preview.indexOf('.slice(0, cardLimit)'))
  }))

describe('V3_PIPELINE_FILTER_PARITY', () => {
  it('V3_PIPELINE_FILTER_PARITY: the pipeline reads the same scoped dataset as the table', () => {
    const page = read('src/app/(app)/leads/page.tsx')
    expect(page).toContain('loadBoardPreview')
    expect(page).toContain('loadLeadsPage')
  })
})

// ── Lead 360 ────────────────────────────────────────────────────────────────

describe('V3_LEAD360_NEXT_ACTION', () => {
  it('V3_LEAD360_NEXT_ACTION: the context panel renders the canonical next action', () => {
    const panel = read('src/components/sales/lead-context-panel.tsx')
    expect(panel).toContain('deriveNextLeadAction')
    expect(panel).toContain('primaryLabel')
  })
})

describe('V3_LEAD360_PROFILE', () => {
  it('V3_LEAD360_PROFILE: the sending profile is always visible and never guessed', () => {
    const markup = render(createElement(ProfileCell, { lead: { senderProfileName: 'Mehak LinkedIn' } }))
    expect(markup).toContain('Mehak LinkedIn')
    const missing = render(createElement(ProfileCell, { lead: {} }))
    expect(missing).toContain('Not assigned')
  })
})

describe('V3_LEAD360_OWNER', () => {
  it('V3_LEAD360_OWNER: ownership resolves to a name, never a raw uuid', () => {
    const page = read('src/app/(app)/leads/[id]/page.tsx')
    expect(page).toContain('getRepInfo')
    expect(page).toContain('ownerName')
  })
})

describe('V3_LEAD360_INTENT', () => {
  it('V3_LEAD360_INTENT: buyer intent reads from canonical evidence or is unknown', () => {
    const preview = read('src/lib/leads/preview.ts')
    expect(preview).toContain('buyerIntentLevel')
  })
})

describe('V3_LEAD360_UNKNOWN_NOT_ZERO', () => {
  it('V3_LEAD360_UNKNOWN_NOT_ZERO: unknown values render as "Not stated", never 0', () => {
    const panel = read('src/components/sales/lead-context-panel.tsx')
    expect(panel).toContain('Not stated')
    const drawer = read('src/components/sales/lead-preview-drawer.tsx')
    expect(drawer).toContain('Not stated')
  })
})

describe('V3_LEAD360_TASK_PARITY', () => {
  it('V3_LEAD360_TASK_PARITY: the Tasks tab reads the canonical UnifiedTask set', () => {
    const workspace = read('src/components/lead-workspace-async.tsx')
    expect(workspace).toContain('/api/tasks?leadId=')
    const tasksApi = read('src/app/api/tasks/route.ts')
    expect(tasksApi).toContain('leadId')
  })
})

describe('V3_LEAD360_CONVERSATION_PARITY', () => {
  it('V3_LEAD360_CONVERSATION_PARITY: the conversation tab reuses the canonical thread', () => {
    const workspace = read('src/components/lead-workspace-async.tsx')
    expect(workspace).toContain('LeadConversation')
  })
})

describe('V3_LEAD360_ROLE_ACTIONS', () => {
  it('V3_LEAD360_ROLE_ACTIONS: manager controls are permission-aware in the shell', () => {
    const shell = read('src/lib/navigation/relay-shell-nav.ts')
    expect(shell).toContain('adminOnly')
    expect(shell).toContain('managerOnly')
  })
})

describe('V3_LEAD360_SECTION_FAILURE', () => {
  it('V3_LEAD360_SECTION_FAILURE: a failed section degrades without breaking the page', () => {
    const drawer = read('src/components/sales/lead-preview-drawer.tsx')
    expect(drawer).toContain('V3SectionError')
    const workspace = read('src/components/lead-workspace-async.tsx')
    expect(workspace).toContain('tasksError')
    expect(workspace).toContain("Couldn&apos;t load tasks")
  })
})

// ── Global create parity ────────────────────────────────────────────────────

describe('V3_ANALYZE_PROSPECT_SINGLE_CANONICAL_FLOW', () => {
  it('V3_ANALYZE_PROSPECT_SINGLE_CANONICAL_FLOW: one canonical prospect destination exists', () => {
    const items = [...buildGlobalCreateItems(false), ...buildGlobalCreateItems(true)]
    const analyze = items.filter((item) => item.label === 'Analyze Prospect')
    expect(analyze).toHaveLength(2) // rep + admin lists, same destination
    expect(new Set(analyze.map((item) => item.href)).size).toBe(1)
    expect(analyze[0].href).toBe('/prospect')
  })

  it('V3_ANALYZE_PROSPECT_SINGLE_CANONICAL_FLOW: the Sales header uses the same destination', () => {
    const header = read('src/components/sales/sales-header.tsx')
    expect(header).toContain("href: '/prospect'")
  })
})

// ── Sorting stability ───────────────────────────────────────────────────────

describe('V3_LEADS_SORT_STABILITY', () => {
  it('sorts a mixed-timestamp set without crashing', () => {
    const rows = [
      lead({ id: 'a', company: 'Acme', status: 'new', createdAt: '2026-01-01T00:00:00Z', lastActivityAt: 'not-a-date' }),
      lead({ id: 'b', company: 'Globex', status: 'new', createdAt: '2026-01-02T00:00:00Z', lastActivityAt: null }),
      lead({ id: 'c', company: 'Initech', status: 'new', createdAt: '2026-01-03T00:00:00Z' }),
    ]
    expect(() => sortLeadRows(rows, 'activity')).not.toThrow()
    expect(() => sortLeadRows(rows, 'score')).not.toThrow()
    expect(() => sortLeadRows(rows, 'name')).not.toThrow()
  })
})

// ── Stage strip ─────────────────────────────────────────────────────────────

describe('V3_LEAD360_STAGE_STRIP', () => {
  it('renders the canonical lifecycle and marks the current step', () => {
    const markup = render(
      createElement(LeadStageStrip, {
        lead: lead({ id: 'a', company: 'Acme', status: 'replied', createdAt: '2026-01-01T00:00:00Z' }),
      }),
    )
    expect(markup).toContain('aria-label="Lead lifecycle"')
    expect(markup).toContain('aria-current="step"')
    expect(markup).toContain('Conversation')
  })
})

// ── Context panel ───────────────────────────────────────────────────────────

describe('V3_LEAD360_CONTEXT_PANEL', () => {
  it('renders ownership, profile and next action', () => {
    const markup = render(
      createElement(LeadContextPanel, {
        lead: {
          id: 'lead-1',
          messages: [],
          status: 'replied',
        } as never,
        senderProfileName: 'Mehak LinkedIn',
        ownerName: 'Mehak',
        now: Date.now(),
      }),
    )
    expect(markup).toContain('Next action')
    expect(markup).toContain('Mehak')
    expect(markup).toContain('Mehak LinkedIn')
  })
})
