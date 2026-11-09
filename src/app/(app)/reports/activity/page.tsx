import { PageHeader } from '@/components/ui/page-header'
import { InlineError, TimelineTable } from '@/components/operations/ops-primitives'
import { OpsFilters } from '@/components/operations/ops-filters'
import { SavedViewsMenu } from '@/components/operations/saved-views-menu'
import { assignableReps, getPeopleDirectory, requireOpsContext } from '@/lib/operations/page-context'
import { effectiveRepIds } from '@/lib/operations/scope'
import { OPS_RANGES, parseOpsFilters, rangeWindow } from '@/lib/operations/filters'
import { ACTIVITY_EVENT_FILTERS, loadTimeline } from '@/lib/operations/activity'

export const dynamic = 'force-dynamic'

/**
 * The one activity report. Reps see their own timeline; managers and admins
 * get the team filters. Activity is a drill-down, never a primary destination.
 */
export default async function ActivityReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOpsContext()
  const filters = parseOpsFilters(await searchParams, { range: '7d' })
  const managerUp = ctx.scope.mode !== 'own'

  const [reps, directory, profilesRes] = await Promise.all([
    managerUp ? assignableReps(ctx) : Promise.resolve([] as Array<{ id: string; name: string }>),
    managerUp ? getPeopleDirectory().catch(() => null) : Promise.resolve(null),
    ctx.client.from('revenue_identities').select('id, identity_name').eq('organization_id', ctx.auth.orgId).order('identity_name').limit(200),
  ])
  const teamMemberIds = filters.team ? directory?.teams.find((t) => t.id === filters.team)?.memberIds ?? [] : null
  const repIds = managerUp
    ? effectiveRepIds(ctx.scope, { repId: filters.rep, teamMemberIds })
    : [ctx.auth.repId]
  const window = rangeWindow(filters.range)

  const rows = await loadTimeline(ctx.client, {
    orgId: ctx.auth.orgId,
    repIds,
    start: window.start,
    end: window.end,
    event: filters.event,
    profileId: filters.profile,
    source: filters.source,
    limit: 250,
  }).catch(() => null)

  const profiles = (profilesRes.data ?? []) as Array<{ id: string; identity_name: string }>

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Reports"
        title="Activity"
        description="Every operational event in your scope, newest first. Drafts, recommendations and page views are not activity."
      />
      <OpsFilters
        basePath="/reports/activity"
        current={{
          range: filters.range,
          team: filters.team,
          rep: filters.rep,
          profile: filters.profile,
          event: filters.event,
          source: filters.source,
        }}
        filters={[
          { key: 'range', label: 'Date range', options: OPS_RANGES.map((r) => ({ value: r.value, label: r.label })) },
          ...(managerUp && directory && directory.teams.length > 0
            ? [{ key: 'team', label: 'Team', allLabel: 'All teams', options: directory.teams.map((t) => ({ value: t.id, label: t.name })) }]
            : []),
          ...(managerUp
            ? [{ key: 'rep', label: 'Rep', allLabel: 'All reps', options: reps.map((r) => ({ value: r.id, label: r.name })) }]
            : []),
          ...(managerUp
            ? [{ key: 'profile', label: 'Profile', allLabel: 'All profiles', options: profiles.map((p) => ({ value: p.id, label: p.identity_name })) }]
            : []),
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
        trailing={<SavedViewsMenu surface="team.activity" />}
      />
      {rows === null ? (
        <InlineError>Activity could not be loaded. Refresh to try again.</InlineError>
      ) : (
        <>
          <TimelineTable rows={rows} now={Date.now()} empty="No operational activity matches these filters." />
          {rows.length >= 250 && (
            <p className="text-[12px] text-graphite">Showing the latest 250 events. Narrow the range or filters to see older ones.</p>
          )}
        </>
      )}
    </div>
  )
}
