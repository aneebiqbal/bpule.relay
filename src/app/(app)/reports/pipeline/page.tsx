import Link from 'next/link'
import { measureLoader } from '@/lib/operations/instrumentation'
import { PageHeader } from '@/components/ui/page-header'
import { InlineError } from '@/components/operations/ops-primitives'
import { ReportFilters, countText } from '@/components/reports/report-views'
import { requireOpsContext, resolveReportContext } from '@/lib/operations/page-context'
import { opsHref, parseOpsFilters } from '@/lib/operations/filters'
import { loadPipelineReport, STUCK_DAYS, type PipelineRow } from '@/lib/operations/reports'

export const dynamic = 'force-dynamic'

/**
 * Pipeline report — where open opportunities sit right now. Counts are
 * database counts; average age comes from a bounded sample (≤1,000 per stage);
 * "stuck" = no conversation update for 14 days. Each stage opens the exact
 * leads / conversations behind it.
 */
export default async function PipelineReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOpsContext()
  const filters = parseOpsFilters(await searchParams)
  const report = await resolveReportContext(ctx, filters)
  const keep = { rep: filters.rep, team: filters.team, profile: filters.profile, source: filters.source }

  let rows: PipelineRow[] | null = null
  try {
    rows = await measureLoader('reports.pipeline', (c) => loadPipelineReport(
      c!,
      { orgId: ctx.auth.orgId, repIds: report.repIds, profileId: filters.profile, source: filters.source },
      {
        qualifiedHref: opsHref('/leads', { scope: ctx.leadScope, owner: filters.rep, profile: filters.profile, source: filters.source, view: 'new' }),
        stageHref: (key) => opsHref('/chats', { ...keep, cstage: key }),
      },
    ), ctx.client)
  } catch (err) {
    console.error('pipeline report failed:', err)
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Reports" title="Pipeline" description="Open opportunities by stage, how they convert, how long they have been there, and what is stuck." />
      <ReportFilters basePath="/reports/pipeline" filters={filters} teams={report.teams} reps={report.reps} profiles={report.profiles} showRange={false} surface="reports.pipeline" />
      {!rows ? (
        <InlineError>The pipeline report could not be loaded. Refresh to try again.</InlineError>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-[13px]">
            <caption className="sr-only">Pipeline by stage</caption>
            <thead className="bg-bone-raised text-[11px] uppercase tracking-[0.06em] text-stone">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Stage</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Count</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Conversion</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Average age</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Stuck &gt;{STUCK_DAYS}d</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-line/70">
                  <th scope="row" className="px-3 py-2 font-medium">
                    <Link href={r.href} className="text-ink underline-offset-2 hover:underline">
                      {r.label}
                    </Link>
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{countText(r.count)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-graphite">{r.conversionPct === null ? '—' : `${r.conversionPct}% of prior`}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-graphite">{r.avgAgeDays === null ? '—' : `${r.avgAgeDays}d`}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.stuck ? 'font-medium text-status-warning' : 'text-graphite'}`}>{countText(r.stuck)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12px] text-graphite">
        Conversion compares adjacent stages of the current pipeline, not a cohort. For cohort conversion use the Sales report.
      </p>
    </div>
  )
}
