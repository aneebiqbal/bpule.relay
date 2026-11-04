import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { applyCanonicalColumnFilters, hasActiveLeadFilters } from '@/lib/leads/leads-page'
import type { Lead } from '@/lib/domain/types'
import type { LeadsQuery } from '@/components/leads/pipeline-utils'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

function lead(partial: Partial<Lead> & Pick<Lead, 'id' | 'company' | 'status'>): Lead {
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
  } as Lead
}

function query(partial: Partial<LeadsQuery> = {}): LeadsQuery {
  return partial as LeadsQuery
}

describe('V3_LEADS_PROFILE_FILTER_PARITY', () => {
  const rows = [
    lead({ id: 'a', company: 'Acme', status: 'new', revenueIdentityId: 'ri-1', senderProfileId: 'sp-1' }),
    lead({ id: 'b', company: 'Beta', status: 'new', senderProfileId: 'sp-2' }),
    lead({ id: 'c', company: 'Gamma', status: 'new', revenueIdentityId: 'ri-2' }),
    lead({ id: 'd', company: 'Delta', status: 'new' }),
  ]

  it('a profile id matches either the revenue identity or the sender profile', () => {
    const matched = applyCanonicalColumnFilters(rows, query({ profile: 'ri-1' }))
    expect(matched.map((row) => row.id)).toEqual(['a'])
    expect(applyCanonicalColumnFilters(rows, query({ profile: 'sp-2' })).map((row) => row.id)).toEqual(['b'])
  })

  it('"No profile" means no sending identity at all — neither column set', () => {
    expect(applyCanonicalColumnFilters(rows, query({ profile: 'unassigned' })).map((row) => row.id)).toEqual(['d'])
  })

  it('"all" and an absent profile filter change nothing', () => {
    expect(applyCanonicalColumnFilters(rows, query({ profile: 'all' }))).toHaveLength(4)
    expect(applyCanonicalColumnFilters(rows, query())).toHaveLength(4)
  })

  it('owner "unassigned" keeps only leads with no owner', () => {
    const owners = [
      lead({ id: 'x', company: 'X', status: 'new', ownerRepId: null }),
      lead({ id: 'y', company: 'Y', status: 'new', ownerRepId: 'rep-9' }),
    ]
    expect(applyCanonicalColumnFilters(owners, query({ owner: 'unassigned' })).map((row) => row.id)).toEqual(['x'])
  })

  it('the table renders every real sending identity, not just All / No profile', () => {
    const source = read('src/components/leads/leads-table.tsx')
    expect(source).toContain('profiles.map((profile) =>')
    expect(source).toContain('<option value="unassigned">No profile</option>')
    expect(source).toContain('{profile.identity_name}</option>')
  })

  it('the loader supplies organization-scoped identities to the table', () => {
    const loader = read('src/lib/leads/leads-page.ts')
    expect(loader).toContain("from('revenue_identities')")
    expect(loader).toContain('.eq(\'organization_id\', authCtx.orgId)')
  })
})

describe('V3_LEADS_PIPELINE_FILTER_PARITY', () => {
  it('detects every filter that changes the result set', () => {
    expect(hasActiveLeadFilters(query())).toBe(false)
    expect(hasActiveLeadFilters(query({ profile: 'all' }))).toBe(false)
    expect(hasActiveLeadFilters(query({ stage: 'all' }))).toBe(false)

    expect(hasActiveLeadFilters(query({ q: 'acme' }))).toBe(true)
    expect(hasActiveLeadFilters(query({ profile: 'ri-1' }))).toBe(true)
    expect(hasActiveLeadFilters(query({ owner: 'rep-1' }))).toBe(true)
    expect(hasActiveLeadFilters(query({ source: 'linkedin' }))).toBe(true)
    expect(hasActiveLeadFilters(query({ priority: 'high' }))).toBe(true)
    expect(hasActiveLeadFilters(query({ stage: 'to_contact' }))).toBe(true)
  })

  it('the pipeline routes through the canonical filtered loader, not the aggregate fast path', () => {
    const page = read('src/app/(app)/leads/page.tsx')
    expect(page).toContain('hasActiveLeadFilters(query)')
    expect(page).toContain('await loadFilteredBoard(query)')
  })

  it('the filtered board and the table share one filter contract', () => {
    const loader = read('src/lib/leads/leads-page.ts')
    // loadLeadsPage delegates its derived path to the same function the board uses.
    expect(loader).toContain('loadScopedFilteredLeads(query)')
    const boardFn = loader.slice(loader.indexOf('export async function loadFilteredBoard'))
    expect(boardFn).toContain('loadScopedFilteredLeads(query)')
    expect(loader).toContain('applyCanonicalColumnFilters(scoped, query)')
  })
})
