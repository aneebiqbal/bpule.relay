import Link from 'next/link'
import { measureLoader } from '@/lib/operations/instrumentation'
import { PageHeader } from '@/components/ui/page-header'
import { InlineError, MetricStrip } from '@/components/operations/ops-primitives'
import { ReportFilters, countText } from '@/components/reports/report-views'
import { requireOpsContext, resolveReportContext } from '@/lib/operations/page-context'
import { opsHref, parseOpsFilters, rangeWindow } from '@/lib/operations/filters'
import { changePct, loadRevenueReport, type RevenueReport } from '@/lib/operations/reports'

export const dynamic = 'force-dynamic'

/**
 * Revenue report — canonical outcomes only (conversation_states.won_at /
 * lost_at set by the outcome action). Revenue is not stored per deal, so it
 * is shown as "Not tracked"; nothing is estimated.
 */
export default async function RevenueReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOpsContext()
  const filters = parseOpsFilters(await searchParams, { range: '90d' })
  const report = await resolveReportContext(ctx, filters)
  const window = rangeWindow(filters.range)

  let data: RevenueReport | null = null
  try {
    data = await measureLoader('reports.revenue', (c) => loadRevenueReport(c!, { orgId: ctx.auth.orgId, repIds: report.repIds, profileId: filters.profile, source: filters.source }, window), ctx.client)
  } catch (err) {
    console.error('revenue report failed:', err)
  }
  const wonHref = opsHref('/leads', { scope: ctx.leadScope, owner: filters.rep, profile: filters.profile, source: filters.source, view: 'won' })
  const lostHref = opsHref('/leads', { scope: ctx.leadScope, owner: filters.rep, profile: filters.profile, source: filters.source, view: 'lost' })

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Reports" title="Revenue" description="Deals closed in this window, from recorded outcomes." />
      <ReportFilters basePath="/reports/revenue" filters={filters} teams={report.teams} reps={report.reps} profiles={report.profiles} surface="reports.revenue" />
      {!data ? (
        <InlineError>The revenue report could not be loaded. Refresh to try again.</InlineError>
      ) : (
        <>
          <MetricStrip
            metrics={[
              { label: 'Won', value: countText(data.won), href: wonHref },
              { label: 'Lost', value: countText(data.lost), href: lostHref },
              { label: 'Win rate', value: data.winRatePct === null ? '—' : `${data.winRatePct}%`, href: wonHref, hint: 'Won ÷ (won + lost) closed in this window.' },
              { label: 'Known revenue', value: 'Not tracked', href: null, hint: 'Relay does not store deal value yet. Nothing is estimated.' },
            ]}
          />
          <p className="text-[12px] text-graphite">
            Previous window: {countText(data.previousWon)} won, {countText(data.previousLost)} lost
            {changePct(data.won, data.previousWon) !== null && ` · won ${changePct(data.won, data.previousWon)! > 0 ? '+' : ''}${changePct(data.won, data.previousWon)}%`}.
            Meetings recorded as wins before the meeting-truth fix carry no won date and are not counted here.
          </p>
          {ctx.auth.isAdmin && (
            <Link href="/admin/revenue-intelligence" className="inline-flex text-[13px] font-medium text-ink">
              Revenue intelligence (admin) →
            </Link>
          )}
        </>
      )}
    </div>
  )
}
