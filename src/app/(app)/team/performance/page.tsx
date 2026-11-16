import { PageHeader } from '@/components/ui/page-header'
import { InlineError, LinkTabs, MetricStrip, Section } from '@/components/operations/ops-primitives'
import { OpsFilters } from '@/components/operations/ops-filters'
import { SavedViewsMenu } from '@/components/operations/saved-views-menu'
import {
  FunnelTable,
  ProfileComparison,
  RepComparison,
  SourceComparison,
  metricsToStrip,
} from '@/components/operations/performance-views'
import { TeamTrendChart } from '@/components/operations/team-trend-chart'
import { TeamTargetsReport } from '@/components/team/team-targets-report'
import { loadTeamTrend } from '@/lib/operations/team-trend'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { assignableReps, getPeopleDirectory, getPerformance, requireTeamContext } from '@/lib/operations/page-context'
import { effectiveRepIds } from '@/lib/operations/scope'
import { OPS_RANGES, opsHref, parseOpsFilters, rangeWindow } from '@/lib/operations/filters'
import { PERIODS, type TargetPeriod } from '@/lib/operations/targets'

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
  const sp = await searchParams
  const filters = parseOpsFilters(sp, { range: '30d' })

  // Performance is organised into views. Every view shares the same filters and
  // the same source metrics, so the numbers never disagree between them.
  const rawView = Array.isArray(sp.view) ? sp.view[0] : sp.view
  const view = (['overview', 'people', 'profiles', 'channels', 'conversions', 'targets'].includes(rawView ?? '')
    ? rawView
    : 'overview') as 'overview' | 'people' | 'profiles' | 'channels' | 'conversions' | 'targets'

  const rawPeriod = Array.isArray(sp.period) ? sp.period[0] : sp.period
  const targetPeriod = (PERIODS.some((p) => p.value === rawPeriod) ? rawPeriod : 'DAY') as TargetPeriod

  const [reps, directory, profilesRes] = await Promise.all([
    assignableReps(ctx),
    getPeopleDirectory().catch(() => null),
    ctx.client.from('revenue_identities').select('id, identity_name, channel').eq('organization_id', ctx.auth.orgId).order('identity_name').limit(200),
  ])
  const teamMemberIds = filters.team ? directory?.teams.find((t) => t.id === filters.team)?.memberIds ?? [] : null
  const repIds = effectiveRepIds(ctx.scope, { repId: filters.rep, teamMemberIds })
  const repKey = repIds === null ? 'scope' : [...repIds].sort().join(',')
  const window = rangeWindow(filters.range)
  const perf = await getPerformance(repKey, window.start, window.end, filters.profile, filters.source).catch((err) => {
    console.error('team performance failed:', err)
    return null
  })
  const timezone = await loadOperatingPolicy(ctx.auth.orgId).then((p) => p.timezone).catch(() => 'UTC')
  const trend = await loadTeamTrend(
    ctx.client,
    { orgId: ctx.auth.orgId, repIds, start: window.start, end: window.end, timezone },
  ).catch(() => null)

  const current = {
    range: filters.range,
    team: filters.team,
    rep: filters.rep,
    profile: filters.profile,
    source: filters.source,
  }
  const activityHref = (event: string | null) =>
    opsHref('/reports/activity', { range: filters.range, team: filters.team, rep: filters.rep, profile: filters.profile }, { event })
  const rangeQuery = `range=${filters.range}`
  const profiles = (profilesRes.data ?? []) as Array<{ id: string; identity_name: string; channel: string }>

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Team"
        title="Performance"
        description="What the team executed, how it converted, and how it tracks against target."
      />
      <OpsFilters
        basePath="/team/performance"
        current={current}
        filters={[
          { key: 'range', label: 'Date range', options: OPS_RANGES.map((r) => ({ value: r.value, label: r.label })) },
          ...(directory && directory.teams.length > 0
            ? [{ key: 'team', label: 'Team', allLabel: 'All teams', options: directory.teams.map((t) => ({ value: t.id, label: t.name })) }]
            : []),
          { key: 'rep', label: 'Rep', allLabel: 'All reps', options: reps.map((r) => ({ value: r.id, label: r.name })) },
          { key: 'profile', label: 'Profile', allLabel: 'All profiles', options: profiles.map((p) => ({ value: p.id, label: `${p.identity_name} · ${p.channel}` })) },
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

      <LinkTabs
        label="Performance view"
        active={view}
        tabs={[
          { value: 'overview', label: 'Overview', href: opsHref('/team/performance', current, { view: null }) },
          { value: 'people', label: 'People', href: opsHref('/team/performance', current, { view: 'people' }) },
          { value: 'profiles', label: 'Profiles', href: opsHref('/team/performance', current, { view: 'profiles' }) },
          { value: 'channels', label: 'Channels', href: opsHref('/team/performance', current, { view: 'channels' }) },
          { value: 'conversions', label: 'Conversions', href: opsHref('/team/performance', current, { view: 'conversions' }) },
          { value: 'targets', label: 'Targets', href: opsHref('/team/performance', current, { view: 'targets' }) },
        ]}
      />

      {view === 'targets' ? (
        <TeamTargetsReport period={targetPeriod} />
      ) : !perf ? (
        <InlineError>Performance could not be loaded. Refresh to try again.</InlineError>
      ) : (
        <>
          {view === 'overview' && (
            <>
              <MetricStrip metrics={metricsToStrip(perf.totals, activityHref)} />
              {perf.truncated && (
                <p className="text-[12px] text-status-warning">This window hit the read limit, so totals may be incomplete. Narrow the range.</p>
              )}
              <Section id="trend" title="Trend" description="Replies, meetings and completed tasks per day, from the aggregated analytics path.">
                {trend ? (
                  <TeamTrendChart data={trend} />
                ) : (
                  <p className="rounded-lg border border-dashed border-line px-3 py-4 text-[13px] text-graphite">
                    Trend isn&apos;t available on this database connection.
                  </p>
                )}
              </Section>
              <Section title="Target versus actual" description="One shared requirement per channel lane, counted once. Edit targets from a profile or the Setup assistant.">
                <TeamTargetsReport period={targetPeriod} />
              </Section>
            </>
          )}

          {view === 'conversions' && (
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
          )}

          {view === 'people' && (
            <Section title="Rep comparison" description="Counts side by side. Reply rate = replied leads ÷ contacted leads.">
              <RepComparison rows={perf.byRep} rangeQuery={rangeQuery} />
            </Section>
          )}

          {(view === 'profiles' || view === 'channels') && (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              {view === 'profiles' && (
                <Section title="Profile comparison" description="Each sending identity's opportunities and results.">
                  <ProfileComparison rows={perf.byProfile} rangeQuery={rangeQuery} />
                </Section>
              )}
              {view === 'channels' && (
                <Section title="Source comparison" description="Qualified = new leads in a strong or worth-pursuing band.">
                  <SourceComparison rows={perf.bySource} rangeQuery={rangeQuery} />
                </Section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
