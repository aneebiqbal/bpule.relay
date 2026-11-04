'use client'

/**
 * Admin / Owner Command Center V3.
 *
 * Sections in mobile order: command header, organization health, needs
 * attention, team progress, team comparison, pipeline health, profile
 * performance, team heatmap, trend, important activity, quick actions.
 * Every chart degrades on its own — health, attention and actions always render.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import type { AdminCommandCenterData } from '@/lib/team/admin-command-summary'
import {
  ADMIN_TEAM_METRICS,
  buildAdminProfileRows,
  buildAdminTeamCompare,
  buildAdminV3Activity,
  buildAdminV3Attention,
  buildAdminV3Health,
  buildAdminV3Pipeline,
  buildAdminV3TeamRows,
  buildAdminExecutionRows,
  buildAdminV3QuickActions,
  type AdminTeamCompareRow,
  type AdminTeamMetricKey,
} from '@/lib/admin/v3-command-present'
import {
  V3ActivityRow,
  V3AttentionRow,
  V3EmptyState,
  V3PageHeader,
  V3SectionError,
  V3SectionTitle,
  V3StageStrip,
  V3Avatar,
  V3PersonRow,
} from '@/components/v3/primitives'
import {
  V3CompareBars,
  V3MetricStrip,
  V3TrendChart,
} from '@/components/v3/visuals'
import { ContributionHeatmap } from '@/components/performance/contribution-heatmap'

const TREND_COLORS: Record<string, string> = {
  replies: 'var(--orange)',
  meetings: 'var(--cobalt)',
  wins: 'var(--ink)',
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

export function AdminCommandCenterView({
  data,
  adminName,
  error,
}: {
  data: AdminCommandCenterData
  adminName: string
  error?: boolean
}) {
  const router = useRouter()
  const health = useMemo(() => buildAdminV3Health(data), [data])
  const attention = useMemo(() => buildAdminV3Attention(data.attention), [data.attention])
  const teamRows = useMemo(() => buildAdminV3TeamRows(data.rows), [data.rows])
  const pipeline = useMemo(() => buildAdminV3Pipeline(data.pipeline), [data.pipeline])
  const activity = useMemo(() => buildAdminV3Activity(data.activity), [data.activity])
  const profiles = useMemo(() => buildAdminProfileRows(data.profiles ?? []), [data.profiles])
  const quickActions = useMemo(() => buildAdminV3QuickActions(data.isOwner), [data.isOwner])

  const executionRows = useMemo(
    () =>
      buildAdminExecutionRows({
        completedToday: data.team?.metrics?.completedToday ?? null,
        repliesHandled: data.executionToday?.repliesHandled ?? null,
        followupsCompleted: data.executionToday?.followupsCompleted ?? null,
        tasksCompleted: data.executionToday?.tasksCompleted ?? null,
        meetings: data.executionToday?.meetings ?? data.health?.meetingsThisWeek ?? null,
      }),
    [data.team, data.executionToday, data.health],
  )

  const compareRows = useMemo(
    () => buildAdminTeamCompare(data.rows, data.executionByRep ?? null, data.tasksCompletedTodayByRep ?? null),
    [data.rows, data.executionByRep, data.tasksCompletedTodayByRep],
  )

  const trendSeries = useMemo(
    () => [
      { key: 'replies', label: 'Replies', color: TREND_COLORS.replies },
      { key: 'meetings', label: 'Meetings', color: TREND_COLORS.meetings },
      { key: 'wins', label: 'Wins', color: TREND_COLORS.wins },
    ],
    [],
  )

  const memberCount = data.team?.memberCount ?? data.rows.length
  const completedToday = data.team?.metrics?.completedToday ?? 0

  return (
    <div className="space-y-8 pb-10">
      <V3PageHeader
        title="Command Center"
        subtitle={data.orgName}
        meta={
          <p className="text-[13px] text-graphite">
            Good <span suppressHydrationWarning>{greeting()}</span>, {adminName.split(' ')[0]}.{' '}
            <span className="font-medium text-ink">{memberCount} {memberCount === 1 ? 'person' : 'people'}</span>
            <span className="text-stone"> · </span>
            <span className="font-medium text-ink">{completedToday} meaningful actions</span> completed today.
          </p>
        }
        actions={
          <>
            <Link
              href="/prospect"
              className="inline-flex items-center gap-1.5 rounded-md bg-solid px-3.5 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
            >
              Analyze Prospect
            </Link>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone"
            >
              Assign Task
            </Link>
            <Link
              href="/admin/people"
              className="hidden items-center gap-1.5 rounded-md border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone sm:inline-flex"
            >
              Invite Person
            </Link>
          </>
        }
      />

      {error && <V3SectionError onRetry={() => router.refresh()} />}

      <section aria-label="Organization health">
        <V3MetricStrip items={health} label="Organization health" />
      </section>

      <section aria-label="Needs attention">
        <V3SectionTitle title="Needs attention" hint={`${data.attention.length} signals`} />
        {attention.length > 0 ? (
          <>
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-bone-raised">
              {attention.map((row) => (
                <V3AttentionRow
                  key={row.id}
                  severity={row.severity}
                  name={row.name}
                  reason={row.reason}
                  ctaLabel={row.ctaLabel}
                  href={row.href}
                />
              ))}
            </ul>
            <Link
              href="/admin/command"
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
            >
              View all attention
              <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          </>
        ) : (
          <div className="mt-3">
            <V3EmptyState
              title="Organization is on track"
              body="No critical replies, follow-ups or attribution gaps need intervention right now."
            />
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <section aria-label="Team progress" className="h-full">
            <V3SectionTitle title="Today's execution" hint="Organization scope" />
            <div className="mt-3">
              <V3CompareBars rows={executionRows} label="Team execution today" />
            </div>
          </section>
        </div>

        <div className="lg:col-span-8">
          <section aria-label="Team performance" className="h-full">
            <V3SectionTitle title="Who completed the most" hint="Canonical counts, no combined score" />
            <div className="mt-3">
              <TeamCompare rows={compareRows} />
            </div>
          </section>
        </div>

        <div className="lg:col-span-12">
          <section aria-label="Team execution rows">
            <V3SectionTitle title="Team execution" hint={`${teamRows.length} people`} />
            {teamRows.length > 0 ? (
              <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-bone-raised">
                {teamRows.map((row) => (
                  <V3PersonRow
                    key={row.id}
                    name={row.name}
                    role={row.role}
                    stats={row.stats}
                    progress={{ label: 'Target', pct: row.targetPct }}
                    status={row.status}
                    href={row.href}
                  />
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-lg border border-line bg-bone-raised px-4 py-6 text-[13px] text-graphite">
                No team members have activity yet.
              </p>
            )}
          </section>
        </div>

        <div className="lg:col-span-7">
          <section aria-label="Pipeline health" className="h-full">
            <V3SectionTitle title="Pipeline health" hint="Open opportunities by stage" />
            <div className="mt-3 space-y-3">
              <V3StageStrip stages={pipeline} />
              {data.stuck && data.stuck.length > 0 && (
                <div className="rounded-lg border border-line bg-bone-raised">
                  <p className="border-b border-line/70 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
                    Stuck / untouched
                  </p>
                  <ul className="divide-y divide-line/70">
                    {data.stuck.slice(0, 4).map((item) => (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-bone/60"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-ink">{item.company}</span>
                            <span className="block truncate text-[11px] text-graphite">{item.reason}</span>
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-graphite">
                            <span
                              className={cn('size-1.5 rounded-full', item.severity === 'critical' ? 'bg-status-danger' : 'bg-status-warning')}
                              aria-hidden="true"
                            />
                            {item.severity}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="lg:col-span-5">
          <section aria-label="Profile performance" className="h-full">
            <V3SectionTitle title="Profiles" hint="Sending-profile performance" />
            <div className="mt-3">
              <ProfileRows rows={profiles} />
            </div>
          </section>
        </div>

        {data.activityDaily && data.activityDaily.length > 0 && (
          <>
            <div className="lg:col-span-7">
              <section aria-label="Team activity" className="h-full">
                <V3SectionTitle title="Team activity" hint="Last 12 weeks" />
                <div className="mt-3 rounded-lg border border-line bg-bone-raised p-4">
                  <ContributionHeatmap daily={data.activityDaily} unit="actions" />
                </div>
              </section>
            </div>

            <div className="lg:col-span-5">
              <section aria-label="Performance trend" className="h-full">
                <V3SectionTitle title="Performance" hint="Last 30 days" />
                <div className="mt-3 rounded-lg border border-line bg-bone-raised p-4">
                  {data.trendPoints && data.trendPoints.length > 0 ? (
                    <V3TrendChart
                      points={data.trendPoints}
                      series={trendSeries}
                      ranges={['7d', '30d']}
                      initialRange="30d"
                      label="Organization performance trend"
                    />
                  ) : (
                    <p className="py-6 text-center text-[12px] text-stone">No trend data yet.</p>
                  )}
                </div>
              </section>
            </div>
          </>
        )}

        <div className="lg:col-span-12">
          <section aria-label="Important activity">
            <V3SectionTitle title="Important activity" hint="Meaningful operational events" />
            {activity.length > 0 ? (
              <ul className="mt-3 divide-y divide-line/70 overflow-hidden rounded-lg border border-line bg-bone-raised">
                {activity.map((item) => (
                  <V3ActivityRow key={item.id} time={item.time} label={item.label} detail={item.detail ?? undefined} href={item.href ?? undefined} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-lg border border-line bg-bone-raised px-4 py-6 text-[13px] text-graphite">
                No meaningful organization events this week.
              </p>
            )}
          </section>
        </div>
      </div>

      <section aria-label="Quick actions">
        <V3SectionTitle title="Quick actions" />
        <ul className="mt-3 flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <li key={action.key}>
              <Link
                href={action.href}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-bone-raised px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-bone"
              >
                {action.label}
                <ChevronRight className="size-3.5 text-stone" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** Per-rep comparison with a metric switch. Bars are pure CSS — no chart lib. */
function TeamCompare({ rows }: { rows: AdminTeamCompareRow[] }) {
  const [metric, setMetric] = useState<AdminTeamMetricKey>('completed')

  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.values[metric] - a.values[metric] || a.name.localeCompare(b.name)),
    [rows, metric],
  )
  const max = Math.max(1, ...sorted.map((row) => row.values[metric]))

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bone-raised">
      <div className="flex flex-wrap gap-1 border-b border-line/70 px-3 py-2" role="group" aria-label="Comparison metric">
        {ADMIN_TEAM_METRICS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={metric === option.key}
            onClick={() => setMetric(option.key)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              metric === option.key ? 'bg-bone text-ink ring-1 ring-line' : 'text-stone hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {sorted.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-graphite">No team members have activity yet.</p>
      ) : (
        <ul className="divide-y divide-line/70">
          {sorted.map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bone/60"
              >
                <V3Avatar name={row.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-ink">{row.name}</span>
                    <span suppressHydrationWarning className="shrink-0 text-[13px] font-medium tabular-nums text-ink">
                      {row.values[metric]}
                    </span>
                  </span>
                  <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-bone" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-orange transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{ width: `${Math.round((row.values[metric] / max) * 100)}%` }}
                    />
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-bone px-2 py-0.5 text-[10px] font-medium text-graphite">
                  {row.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Compact profile rows — grid lines, not a spreadsheet table. */
function ProfileRows({ rows }: { rows: ReturnType<typeof buildAdminProfileRows> }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-bone-raised px-4 py-6 text-[13px] text-graphite">
        No assigned profiles yet.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bone-raised">
      <div className="hidden grid-cols-[minmax(0,1fr)_repeat(4,3.5rem)] gap-2 border-b border-line/70 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-stone sm:grid">
        <span>Profile</span>
        <span className="text-right">Leads</span>
        <span className="text-right">Replies</span>
        <span className="text-right">Meetings</span>
        <span className="text-right">Wins</span>
      </div>
      <ul className="divide-y divide-line/70">
        {rows.map((row) => (
          <li key={row.identityId}>
            <Link
              href="/manage-profiles"
              className="grid grid-cols-2 items-center gap-x-2 gap-y-1 px-4 py-2.5 transition-colors hover:bg-bone/60 sm:grid-cols-[minmax(0,1fr)_repeat(4,3.5rem)] sm:gap-2"
            >
              <span className="col-span-2 min-w-0 sm:col-span-1">
                <span className="block truncate text-[13px] font-medium text-ink">{row.name}</span>
                <span className="block text-[11px] text-stone">{row.channel}</span>
              </span>
              <span className="text-right text-[13px] tabular-nums text-ink">{row.leads}</span>
              <span className="text-right text-[13px] tabular-nums text-ink">
                {row.replies}
                {row.replyRate != null && (
                  <span className="ml-1 text-[11px] text-stone">{row.replyRate}%</span>
                )}
              </span>
              <span className="text-right text-[13px] tabular-nums text-ink">{row.meetings}</span>
              <span className="text-right text-[13px] tabular-nums text-ink">{row.wins}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
