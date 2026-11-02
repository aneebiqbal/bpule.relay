import { PageHeader } from '@/components/ui/page-header'
import { measureLoader } from '@/lib/operations/instrumentation'
import { InlineError, Section } from '@/components/operations/ops-primitives'
import { CountTable, ReportFilters } from '@/components/reports/report-views'
import { requireOpsContext, resolveReportContext } from '@/lib/operations/page-context'
import { opsHref, parseOpsFilters, rangeWindow } from '@/lib/operations/filters'
import { loadSalesReport, QUALIFIED_MIN_SCORE, type SalesReport } from '@/lib/operations/reports'

export const dynamic = 'force-dynamic'

/**
 * Sales report — how the window's new leads progressed, and what the team
 * executed in the window. Every number is a database count; conversion is
 * step-to-step; change is shown only when the previous window is known.
 */
export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOpsContext()
  const filters = parseOpsFilters(await searchParams, { range: '30d' })
  const report = await resolveReportContext(ctx, filters)
  const window = rangeWindow(filters.range)
  const scopeParam = ctx.leadScope
  const keep = { rep: filters.rep, team: filters.team, profile: filters.profile, source: filters.source }

  let data: SalesReport | null = null
  try {
    data = await measureLoader('reports.sales', (c) => loadSalesReport(
      c!,
      { orgId: ctx.auth.orgId, repIds: report.repIds, profileId: filters.profile, source: filters.source },
      window,
      {
        // `scope` is always set, so the href already has a query string for `&…` suffixes.
        leads: opsHref('/leads', { scope: scopeParam, owner: filters.rep, profile: filters.profile, source: filters.source }),
        chats: (stage) => opsHref('/chats', { ...keep, cstage: stage }),
        activity: (event) =>
          ctx.scope.mode === 'own'
            ? opsHref('/reports/activity', { range: filters.range, event })
            : opsHref('/team/activity', { range: filters.range, ...keep, event }),
      },
    ), ctx.client)
  } catch (err) {
    console.error('sales report failed:', err)
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Reports" title="Sales" description={ctx.scope.mode === 'own' ? 'Your pipeline progress and execution.' : 'Pipeline progress and execution for your scope.'} />
      <ReportFilters basePath="/reports/sales" filters={filters} teams={report.teams} reps={report.reps} profiles={report.profiles} surface="reports.sales" />
      {!data ? (
        <InlineError>The sales report could not be loaded. Refresh to try again.</InlineError>
      ) : (
        <>
          <Section
            title="Progression"
            description={`Leads created in this window, counted at their furthest known stage. Qualified = canonical score ≥ ${QUALIFIED_MIN_SCORE}.`}
          >
            <CountTable caption="Lead progression with step conversion" rows={data.cohort} />
          </Section>
          <Section title="Execution in this window" description="Executed events only — drafts and failed sends are excluded.">
            <CountTable caption="Executed activity in this window" rows={data.activity} showConversion={false} />
          </Section>
        </>
      )}
    </div>
  )
}
