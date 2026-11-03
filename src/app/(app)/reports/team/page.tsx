import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { InlineError, Section } from '@/components/operations/ops-primitives'
import { RepComparison } from '@/components/operations/performance-views'
import { ReportFilters } from '@/components/reports/report-views'
import { getPerformance, requireOpsContext, resolveReportContext } from '@/lib/operations/page-context'
import { parseOpsFilters, rangeWindow } from '@/lib/operations/filters'

export const dynamic = 'force-dynamic'

/**
 * Team report — execution per rep, side by side. Counts, never a combined
 * productivity score. Managers see their team; admins the organization.
 */
export default async function TeamReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOpsContext()
  if (ctx.scope.mode === 'own') redirect('/performance')
  const filters = parseOpsFilters(await searchParams, { range: '30d' })
  const report = await resolveReportContext(ctx, filters)
  const window = rangeWindow(filters.range)
  const repKey = report.repIds === null ? 'scope' : [...report.repIds].sort().join(',')
  const perf = await getPerformance(repKey, window.start, window.end, filters.profile, filters.source).catch((err) => {
    console.error('team report failed:', err)
    return null
  })

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Reports" title="Team" description="What each person executed in this window. Reply rate = replied leads ÷ contacted leads." />
      <ReportFilters basePath="/reports/team" filters={filters} teams={report.teams} reps={report.reps} profiles={report.profiles} surface="reports.team" />
      {!perf ? (
        <InlineError>The team report could not be loaded. Refresh to try again.</InlineError>
      ) : (
        <Section title="Execution by rep" description="Leads worked, messages sent, replies, meetings, proposals, wins and tasks completed.">
          <RepComparison rows={perf.byRep} rangeQuery={`range=${filters.range}`} />
          {perf.truncated && <p className="text-[12px] text-status-warning">This window has more than 50,000 events; narrow the range for complete totals.</p>}
        </Section>
      )}
    </div>
  )
}
