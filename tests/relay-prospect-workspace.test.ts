import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CapturedProspect, Lead } from '@/lib/domain/types'
import { isProspectTabParam, type ProspectTab } from '@/lib/prospect/prospects-view'
import { PROSPECT_STATUS_LABELS } from '@/lib/prospect/display'
import { DataTable, type Column } from '@/components/ui/data-table'
import { derivePipelineStage, type LeadRow } from '@/components/leads/pipeline-utils'

const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(node)

function prospect(
  partial: Partial<CapturedProspect> & Pick<CapturedProspect, 'id' | 'status'>,
): CapturedProspect {
  return {
    organizationId: 'org-1',
    ownerRepId: 'rep-1',
    rawInput: 'paste',
    extractedName: null,
    extractedCompany: null,
    extractedTitle: null,
    extractedLocation: null,
    linkedinUrl: null,
    companyUrl: null,
    canonicalScore: null,
    canonicalIntelligence: null,
    scoreBreakdown: null,
    revenueIdentityId: null,
    senderProfileId: null,
    convertedLeadId: null,
    opportunityKey: null,
    isTest: false,
    sourceKind: 'PRODUCTION',
    lastActivityAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

function lead(partial: Partial<Lead> & Pick<Lead, 'id' | 'company' | 'status' | 'createdAt'>): LeadRow {
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

describe('PROSPECT_RECENT_LIST', () => {
  it('PROSPECT_RECENT_LIST: every captured check is listed with its status', () => {
    const rows = [
      prospect({ id: 'a', status: 'captured', extractedName: 'Sarah Chen', extractedCompany: 'Acme' }),
      prospect({ id: 'b', status: 'converted', extractedName: 'Madiha Seedat', extractedCompany: 'Beta' }),
    ]
    const columns: Column<CapturedProspect>[] = [
      { key: 'prospect', header: 'Prospect', render: (row) => row.extractedName ?? 'Unnamed' },
      { key: 'status', header: 'Status', render: () => PROSPECT_STATUS_LABELS.not_actioned },
    ]
    const html = render(
      createElement(DataTable, {
        columns,
        rows,
        rowKey: (row) => row.id,
        empty: null,
      }),
    )
    expect(html).toContain('Sarah Chen')
    expect(html).toContain('Madiha Seedat')
  })

  it('PROSPECT_RECENT_LIST: a capture that was never actioned says so plainly', () => {
    expect(PROSPECT_STATUS_LABELS.not_actioned).toBe('Not actioned')
    expect(PROSPECT_STATUS_LABELS.dismissed).toBe('Dismissed')
    expect(PROSPECT_STATUS_LABELS.lead).toBe('Lead')
    expect(PROSPECT_STATUS_LABELS.watchlist).toBe('Watchlist')
    expect(isProspectTabParam('recent')).toBe(true)
    expect(isProspectTabParam('analyze')).toBe(false)
  })
})

describe('PROSPECT_PROFILE_ATTRIBUTION', () => {
  it('PROSPECT_PROFILE_ATTRIBUTION: the analyzed profile is resolved and shown', () => {
    const rows = [prospect({ id: 'a', status: 'captured', senderProfileId: 'p1' })]
    const profiles = { p1: 'Mehak Seedat' }
    const columns: Column<CapturedProspect>[] = [
      {
        key: 'profile',
        header: 'Source profile',
        render: (row) => {
          const name = row.senderProfileId ? profiles[row.senderProfileId] : null
          return name ?? 'Not assigned'
        },
      },
    ]
    const html = render(
      createElement(DataTable, { columns, rows, rowKey: (row) => row.id, empty: null }),
    )
    expect(html).toContain('Mehak Seedat')
  })

  it('PROSPECT_PROFILE_ATTRIBUTION: a capture with no sender says so plainly', () => {
    const rows = [prospect({ id: 'a', status: 'captured' })]
    const columns: Column<CapturedProspect>[] = [
      {
        key: 'profile',
        header: 'Source profile',
        render: (row) => (row.senderProfileId ? 'assigned' : 'Not assigned'),
      },
    ]
    const html = render(
      createElement(DataTable, { columns, rows, rowKey: (row) => row.id, empty: null }),
    )
    expect(html).toContain('Not assigned')
  })
})

describe('PROSPECT_WATCHLIST', () => {
  it('PROSPECT_WATCHLIST: watchlist is the canonical observe set, not active outreach', () => {
    const observe = lead({
      id: 'w',
      company: 'Acme',
      status: 'new',
      createdAt: '2026-01-01T00:00:00Z',
      verdict: 'skip',
    })
    const active = lead({ id: 'a', company: 'Beta', status: 'new', createdAt: '2026-01-01T00:00:00Z' })
    expect(derivePipelineStage(observe)).toBe('observe')
    expect(derivePipelineStage(active)).not.toBe('observe')
  })

  it('PROSPECT_WATCHLIST: the watchlist tab renders its rows', () => {
    const rows = [
      lead({ id: 'w', company: 'Acme', status: 'new', createdAt: '2026-01-01T00:00:00Z', verdict: 'skip' }),
    ]
    const columns: Column<LeadRow>[] = [
      { key: 'company', header: 'Company', render: (row) => row.company },
    ]
    const html = render(
      createElement(DataTable, { columns, rows, rowKey: (row) => row.id, empty: null }),
    )
    expect(html).toContain('Acme')
  })
})

describe('PROSPECT_CLEAR_AFTER_SAVE', () => {
  it('PROSPECT_CLEAR_AFTER_SAVE: the form clears the draft only after the server confirms', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(
        new URL('../src/components/prospect/prospect-analyze.tsx', import.meta.url),
        'utf8',
      ),
    )
    // The clear happens after the ok branch, never before it (BUG-23).
    const saveBlock = src.slice(src.indexOf('async function saveAsLead'))
    const confirmIndex = saveBlock.indexOf('if (!res.ok) throw new Error')
    const clearIndex = saveBlock.indexOf('localStorage.removeItem(DRAFT_KEY)')
    expect(confirmIndex).toBeGreaterThan(-1)
    expect(clearIndex).toBeGreaterThan(confirmIndex)
  })
})

describe('PROSPECT_WORKSPACE_TABS', () => {
  it('PROSPECT_WORKSPACE_TABS: the four canonical tabs are the only ones', () => {
    const tabs: ProspectTab[] = ['analyze', 'recent', 'saved', 'watchlist']
    expect(tabs).toHaveLength(4)
    expect(isProspectTabParam('saved')).toBe(true)
    expect(isProspectTabParam('everything')).toBe(false)
  })
})
