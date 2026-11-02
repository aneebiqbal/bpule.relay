import { PageHeader } from '@/components/ui/page-header'
import { InlineError, TimelineTable } from '@/components/operations/ops-primitives'
import { OpsFilters } from '@/components/operations/ops-filters'
import { SavedViewsMenu } from '@/components/operations/saved-views-menu'
import { assignableReps, getPeopleDirectory, requireTeamContext } from '@/lib/operations/page-context'
import { effectiveRepIds } from '@/lib/operations/scope'
import { OPS_RANGES, parseOpsFilters, rangeWindow } from '@/lib/operations/filters'
import { ACTIVITY_EVENT_FILTERS, loadTimeline } from '@/lib/operations/activity'

export const dynamic = 'force-dynamic'

/**
 * Team → Activity. The organization's operational audit feed: sends,
 * replies, meetings, outcomes, task lifecycle and internal notes. No UI noise.
 */
export default async function ActivityCenterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireTeamContext()
  const filters = parseOpsFilters(await searchParams, { range: 'today' })

  const [reps, directory, profilesRes] = await Promise.all([
    assignableReps(ctx),
    getPeopleDirectory().catch(() => null),
    ctx.client.from('revenue_identities').select('id, identity_name').eq('organization_id', ctx.auth.orgId).order('identity_name').limit(200),
  ])
  const teamMemberIds = filters.team ? directory?.teams.find((t) => t.id === filters.team)?.memberIds ?? [] : null
  const repIds = effectiveRepIds(ctx.scope, { repId: filters.rep, teamMemberIds })
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
  }).catch((err) => {
    console.error('activity center failed:', err)
    return null
  })

  const sourceRows = rows

  const profiles = (profilesRes.data ?? []) as Array<{ id: string; identity_name: string }>

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Team"
        title="Activity"
        description="Every operational event in your scope, newest first. Drafts, recommendations and page views are not activity."
      />
      <OpsFilters
        basePath="/team/activity"
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
          ...(directory && directory.teams.length > 0
            ? [{ key: 'team', label: 'Team', allLabel: 'All teams', options: directory.teams.map((t) => ({ value: t.id, label: t.name })) }]
            : []),
          { key: 'rep', label: 'Rep', allLabel: 'All reps', options: reps.map((r) => ({ value: r.id, label: r.name })) },
          { key: 'profile', label: 'Profile', allLabel: 'All profiles', options: profiles.map((p) => ({ value: p.id, label: p.identity_name })) },
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
      {sourceRows === null ? (
        <InlineError>Activity could not be loaded. Refresh to try again.</InlineError>
      ) : (
        <>
          <TimelineTable rows={sourceRows} now={Date.now()} empty="No operational activity matches these filters." />
          {sourceRows.length >= 250 && (
            <p className="text-[12px] text-graphite">Showing the latest 250 events. Narrow the range or filters to see older ones.</p>
          )}
        </>
      )}
    </div>
  )
}
