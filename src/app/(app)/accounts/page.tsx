import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { InlineError, MetricStrip } from '@/components/operations/ops-primitives'
import { OpsFilters } from '@/components/operations/ops-filters'
import { SavedViewsMenu } from '@/components/operations/saved-views-menu'
import { AccountsTable } from '@/components/operations/accounts-table'
import { requireAdminOpsContext } from '@/lib/operations/page-context'
import { opsHref, parseOpsFilters } from '@/lib/operations/filters'
import { groupAccounts, loadAccountLeads, type AccountRow } from '@/lib/operations/accounts'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

const STAGE_VIEWS = [
  { value: 'active', label: 'Has active opportunity' },
  { value: 'conversation', label: 'In conversation or later' },
  { value: 'waiting', label: 'Reply waiting' },
  { value: 'multi', label: 'Several people contacted' },
  { value: 'won', label: 'Won' },
]

function matchesView(row: AccountRow, view: string | null): boolean {
  switch (view) {
    case 'active':
      return row.activeOpportunities > 0
    case 'conversation':
      return ['reply', 'meeting', 'proposal', 'won'].includes(row.relationship)
    case 'waiting':
      return row.nextAction.startsWith('Reply to')
    case 'multi':
      return row.people > 1
    case 'won':
      return row.wins > 0
    default:
      return true
  }
}

/**
 * Accounts — companies, not leads. One row per company key with everyone
 * Relay knows there, so parallel outreach to the same company is visible.
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireAdminOpsContext()
  const sp = await searchParams
  const filters = parseOpsFilters(sp)
  const page = Math.max(1, Math.floor(Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1))

  let rows: AccountRow[] | null = null
  let truncated = false
  try {
    const loaded = await loadAccountLeads(ctx.client, { orgId: ctx.auth.orgId, repIds: ctx.scope.repIds, q: filters.q })
    truncated = loaded.truncated
    rows = groupAccounts(loaded.leads)
  } catch (err) {
    console.error('accounts failed:', err)
  }

  const header = (
    <PageHeader eyebrow="Accounts" title="Companies" description="Every company Relay is working, with the people, profiles and next step for each." />
  )
  if (!rows) {
    return (
      <div className="space-y-5">
        {header}
        <InlineError>Accounts could not be loaded. Refresh to try again.</InlineError>
      </div>
    )
  }

  const filtered = rows.filter((r) => matchesView(r, filters.view))
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const base = { q: filters.q, view: filters.view }

  return (
    <div className="space-y-5">
      {header}
      <MetricStrip
        metrics={[
          { label: 'Companies', value: rows.length, href: '/accounts' },
          { label: 'With active opps', value: rows.filter((r) => r.activeOpportunities > 0).length, href: '/accounts?view=active' },
          { label: 'Reply waiting', value: rows.filter((r) => matchesView(r, 'waiting')).length, href: '/accounts?view=waiting' },
          { label: 'Several people', value: rows.filter((r) => r.people > 1).length, href: '/accounts?view=multi' },
        ]}
      />
      <OpsFilters
        basePath="/accounts"
        current={base}
        search={{ placeholder: 'Search companies…' }}
        filters={[{ key: 'view', label: 'Stage', allLabel: 'All companies', options: STAGE_VIEWS }]}
        trailing={<SavedViewsMenu surface="accounts" />}
      />
      <AccountsTable rows={visible} now={Date.now()} />
      <div className="flex items-center justify-between text-[12px] text-graphite">
        <span>
          {filtered.length} compan{filtered.length === 1 ? 'y' : 'ies'}
          {truncated && ' · built from the 10,000 most recent leads — search to find older companies'}
        </span>
        {pageCount > 1 && (
          <nav aria-label="Pagination" className="flex items-center gap-2">
            {current > 1 ? <Link href={opsHref('/accounts', base, { page: String(current - 1) })} className="hover:text-ink">← Previous</Link> : <span className="text-stone">← Previous</span>}
            <span className="tabular-nums">
              {current} / {pageCount}
            </span>
            {current < pageCount ? <Link href={opsHref('/accounts', base, { page: String(current + 1) })} className="hover:text-ink">Next →</Link> : <span className="text-stone">Next →</span>}
          </nav>
        )}
      </div>
    </div>
  )
}
