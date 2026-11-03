import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { InlineError, TimelineTable } from '@/components/operations/ops-primitives'
import { OpsFilters } from '@/components/operations/ops-filters'
import { requireOpsContext } from '@/lib/operations/page-context'
import { OPS_RANGES, opsHref, parseOpsFilters, rangeWindow } from '@/lib/operations/filters'
import { ACTIVITY_EVENT_FILTERS, loadTimeline } from '@/lib/operations/activity'

export const dynamic = 'force-dynamic'

/**
 * Activity report — "what happened?". Managers and admins use the Activity
 * Center (same loader, team filters); a rep sees their own timeline here.
 */
export default async function ActivityReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOpsContext()
  const sp = await searchParams
  const filters = parseOpsFilters(sp, { range: '7d' })
  if (ctx.scope.mode !== 'own') {
    redirect(
      opsHref('/team/activity', {
        range: filters.range,
        team: filters.team,
        rep: filters.rep,
        profile: filters.profile,
        event: filters.event,
        source: filters.source,
      }),
    )
  }
  const window = rangeWindow(filters.range)
  const rows = await loadTimeline(ctx.client, {
    orgId: ctx.auth.orgId,
    repIds: [ctx.auth.repId],
    start: window.start,
    end: window.end,
    event: filters.event,
    source: filters.source,
    limit: 250,
  }).catch(() => null)

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Reports" title="Activity" description="Everything you executed in this window, newest first." />
      <OpsFilters
        basePath="/reports/activity"
        current={{ range: filters.range, event: filters.event, source: filters.source }}
        filters={[
          { key: 'range', label: 'Date range', options: OPS_RANGES.map((r) => ({ value: r.value, label: r.label })) },
          { key: 'event', label: 'Event type', allLabel: 'All events', options: ACTIVITY_EVENT_FILTERS },
          {
            key: 'source',
            label: 'Source',
            allLabel: 'All sources',
            options: [
              { value: 'linkedin', label: 'LinkedIn' },
              { value: 'upwork', label: 'Upwork' },
              { value: 'other', label: 'Other' },
            ],
          },
        ]}
      />
      {rows === null ? (
        <InlineError>Activity could not be loaded.</InlineError>
      ) : (
        <TimelineTable rows={rows} now={Date.now()} empty="No activity in this window." showActor={false} />
      )}
    </div>
  )
}
