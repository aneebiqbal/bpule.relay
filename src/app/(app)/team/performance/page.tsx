import { PageHeader } from '@/components/ui/page-header'
import { InlineError, MetricStrip, Section } from '@/components/operations/ops-primitives'
import { OpsFilters } from '@/components/operations/ops-filters'
import { SavedViewsMenu } from '@/components/operations/saved-views-menu'
import {
  FunnelTable,
  ProfileComparison,
  RepComparison,
  SourceComparison,
  metricsToStrip,
} from '@/components/operations/performance-views'
import { assignableReps, getPeopleDirectory, getPerformance, requireTeamContext } from '@/lib/operations/page-context'
import { effectiveRepIds } from '@/lib/operations/scope'
import { OPS_RANGES, opsHref, parseOpsFilters, rangeWindow } from '@/lib/operations/filters'

export const dynamic = 'force-dynamic'

/**
 * Team → Performance. Execution counts, conversion, and side-by-side
 * comparisons by rep, sending profile and source. Managers see what actually
 * happened — there is no single opaque score.
 */
export default async function TeamPerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireTeamContext()
  const filters = parseOpsFilters(await searchParams, { range: '30d' })

  const [reps, directory, profilesRes] = await Promise.all([
    assignableReps(ctx),
    getPeopleDirectory().catch(() => null),
    ctx.client.from('revenue_identities').select('id, identity_name').eq('organization_id', ctx.auth.orgId).order('identity_name').limit(200),
  ])
  const teamMemberIds = filters.team ? directory?.teams.find((t) => t.id === filters.team)?.memberIds ?? [] : null
  const repIds = effectiveRepIds(ctx.scope, { repId: filters.rep, teamMemberIds })
  const repKey = repIds === null ? 'scope' : [...repIds].sort().join(',')
  const window = rangeWindow(filters.range)
  const perf = await getPerformance(repKey, window.start, window.end, filters.profile, filters.source).catch((err) => {
    console.error('team performance failed:', err)
    return null
  })

  const current = {
    range: filters.range,
    team: filters.team,
    rep: filters.rep,
    profile: filters.profile,
    source: filters.source,
  }
  const activityHref = (event: string | null) =>
    opsHref('/team/activity', { range: filters.range, team: filters.team, rep: filters.rep, profile: filters.profile }, { event })
  const rangeQuery = `range=${filters.range}`
  const profiles = (profilesRes.data ?? []) as Array<{ id: string; identity_name: string }>

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Team" title="Performance" description="What the team executed in this window, and how it converted." />
      <OpsFilters
        basePath="/team/performance"
        current={current}
        filters={[
          { key: 'range', label: 'Date range', options: OPS_RANGES.map((r) => ({ value: r.value, label: r.label })) },
          ...(directory && directory.teams.length > 0
            ? [{ key: 'team', label: 'Team', allLabel: 'All teams', options: directory.teams.map((t) => ({ value: t.id, label: t.name })) }]
            : []),
          { key: 'rep', label: 'Rep', allLabel: 'All reps', options: reps.map((r) => ({ value: r.id, label: r.name })) },
          { key: 'profile', label: 'Profile', allLabel: 'All profiles', options: profiles.map((p) => ({ value: p.id, label: p.identity_name })) },
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
        trailing={<SavedViewsMenu surface="team.performance" />}
      />

      {!perf ? (
        <InlineError>Performance could not be loaded. Refresh to try again.</InlineError>
      ) : (
        <>
          <MetricStrip metrics={metricsToStrip(perf.totals, activityHref)} />
          {perf.truncated && (
            <p className="text-[12px] text-status-warning">This window hit the read limit, so totals may be incomplete. Narrow the range.</p>
          )}

          <Section id="conversion" title="Conversion" description="Leads created in this window, counted at their furthest known stage. Click a stage to inspect those leads.">
            <FunnelTable
              steps={perf.funnel}
              inspectHref={(s) =>
                s.key === 'reply'
                  ? `/leads?view=needs_reply&scope=${ctx.leadScope}`
                  : s.key === 'won'
                    ? `/leads?view=won&scope=${ctx.leadScope}`
                    : s.key === 'lead'
                      ? `/leads?scope=${ctx.leadScope}`
                      : null
              }
            />
          </Section>

          <Section title="Rep comparison" description="Counts side by side. Reply rate = replied leads ÷ contacted leads.">
            <RepComparison rows={perf.byRep} rangeQuery={rangeQuery} />
          </Section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Section title="Profile comparison" description="Each sending identity's opportunities and results.">
              <ProfileComparison rows={perf.byProfile} rangeQuery={rangeQuery} />
            </Section>
            <Section title="Source comparison" description="Qualified = new leads in a strong or worth-pursuing band.">
              <SourceComparison rows={perf.bySource} rangeQuery={rangeQuery} />
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
