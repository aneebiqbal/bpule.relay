'use client'

/**
 * Relay V4 — Admin / Owner Home: the intervention cockpit.
 *
 * Admin is not a bigger dashboard. The page answers, in order: is the
 * organization healthy, who needs intervention, what executed today, where is
 * pipeline stuck. Deep people and profile reports live in Team / Insights.
 * Every count is canonical; a failed section degrades on its own.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import type { AdminCommandCenterData } from '@/lib/team/admin-command-summary'
import {
  ADMIN_TEAM_METRICS,
  buildAdminExecutionRows,
  buildAdminProfileRows,
  buildAdminTeamCompare,
  buildAdminV3Activity,
  buildAdminV3Attention,
  buildAdminV3Health,
  buildAdminV3Pipeline,
  buildAdminV3QuickActions,
  buildAdminV3TeamRows,
  type AdminTeamCompareRow,
  type AdminTeamMetricKey,
} from '@/lib/admin/v3-command-present'
import {
  V3CompareBars,
  V3TrendChart,
} from '@/components/v3/visuals'
import { V3StageStrip } from '@/components/v3/primitives'
import { ContributionHeatmap } from '@/components/performance/contribution-heatmap'
import {
  V4Avatar,
  V4Chip,
  V4Empty,
  V4PageHeader,
  V4Panel,
  V4PanelHeader,
  V4StatStrip,
} from '@/components/v4/primitives'

const TREND_COLORS: Record<string, string> = {
  replies: 'var(--orange)',
  meetings: 'var(--cobalt)',
  wins: 'var(--ink)',
}

export function V4AdminHome({
  data,
  adminName,
  error,
  greeting,
}: {
  data: AdminCommandCenterData
  adminName: string
  error?: boolean
  /** Server-computed in the viewer's timezone so SSR and hydration agree. */
  greeting: string
}) {
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
    <div className="space-y-8">
      <V4PageHeader
        eyebrow="Home / Command"
        title="Command Center"
        subtitle={data.orgName}
        meta={
          <p className="text-[13px] text-graphite">
            Good <span>{greeting}</span>, {adminName.split(' ')[0]}.{' '}
            <span className="font-medium text-ink">{memberCount} {memberCount === 1 ? 'person' : 'people'}</span>
            <span className="text-stone"> · </span>
            <span className="font-medium text-ink">{completedToday} meaningful actions</span> completed today.
          </p>
        }
        actions={
          <>
            <Link
              href="/prospect"
              className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3.5 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
            >
              Analyze Prospect
            </Link>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone"
            >
              Assign Task
            </Link>
            <Link
              href="/admin/people"
              className="hidden items-center gap-1.5 rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone sm:inline-flex"
            >
              Invite Person
            </Link>
          </>
        }
      />

      {error && (
        <div role="alert" className="rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-[12px] text-graphite">
          Some organization data could not be loaded. Health, attention and actions below are still available.
        </div>
      )}

      <section aria-label="Organization health">
        <V4StatStrip items={health} label="Organization health" />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
        {/* Needs attention */}
        <div className="lg:col-span-5">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="Attention"
              title="Needs intervention"
              hint={`${data.attention.length} signals`}
              action={
                <Link href="/admin/command" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  All <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {attention.length > 0 ? (
              <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                {attention.map((row) => (
                  <li key={row.id}>
                    <Link href={row.href} className="flex items-start gap-3 px-3 py-3 transition-colors hover:bg-bone">
                      <V4Avatar name={row.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-[13px] font-medium text-ink">{row.name}</p>
                          <V4Chip tone={row.severity === 'critical' ? 'danger' : row.severity === 'attention' ? 'warning' : 'success'}>
                            {row.severity}
                          </V4Chip>
                        </div>
                        <p className="mt-0.5 text-[12px] text-graphite">{row.reason}</p>
                      </div>
                      <span className="shrink-0 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-ink">
                        {row.ctaLabel}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4">
                <V4Empty title="Organization is on track" body="No critical replies, follow-ups or attribution gaps need intervention right now." />
              </div>
            )}
          </V4Panel>
        </div>

        {/* Team execution */}
        <div className="lg:col-span-7">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="Today's execution"
              title="Team execution"
              hint="Canonical counts — no combined score"
              action={
                <Link href="/team/profiles" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  Profiles <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            <div className="mt-4 space-y-4">
              <V3CompareBars rows={executionRows} label="Team execution today" />
              <TeamCompare rows={compareRows} />
            </div>
          </V4Panel>
        </div>

        {/* Pipeline health */}
        <div className="lg:col-span-7">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="Pipeline"
              title="Pipeline health"
              hint="Open opportunities by stage"
              action={
                <Link href="/leads?view=pipeline" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  Pipeline <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            <div className="mt-4 space-y-3">
              <V3StageStrip stages={pipeline} />
              {data.stuck && data.stuck.length > 0 && (
                <div className="overflow-hidden rounded-xl ring-1 ring-line">
                  <p className="border-b border-line/70 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
                    Stuck / untouched
                  </p>
                  <ul className="divide-y divide-line/70">
                    {data.stuck.slice(0, 4).map((item) => (
                      <li key={item.id}>
                        <Link href={item.href} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-bone">
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-ink">{item.company}</span>
                            <span className="block truncate text-[11px] text-graphite">{item.reason}</span>
                          </span>
                          <V4Chip tone={item.severity === 'critical' ? 'danger' : 'warning'}>
                            <span className={cn('size-1.5 rounded-full', item.severity === 'critical' ? 'bg-status-danger' : 'bg-status-warning')} aria-hidden />
                            {item.severity}
                          </V4Chip>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </V4Panel>
        </div>

        {/* Profiles */}
        <div className="lg:col-span-5">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="Profiles"
              title="Sending-profile performance"
              action={
                <Link href="/manage-profiles" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  Manage <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            <div className="mt-4">
              <ProfileRows rows={profiles} />
            </div>
          </V4Panel>
        </div>

        {/* Team execution rows */}
        <div className="lg:col-span-12">
          <V4Panel>
            <V4PanelHeader
              eyebrow="People"
              title="Team execution"
              hint={`${teamRows.length} people`}
              action={
                <Link href="/team" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  Team overview <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {teamRows.length > 0 ? (
              <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                {teamRows.map((row) => (
                  <li key={row.id}>
                    <Link href={row.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bone">
                      <V4Avatar name={row.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">{row.name}</p>
                        {row.role && <p className="truncate text-[11px] text-stone">{row.role}</p>}
                      </div>
                      <div className="hidden w-28 shrink-0 sm:block">
                        <div className="flex items-baseline justify-between text-[10px] text-stone">
                          <span>Target</span>
                          <span className="tabular-nums text-ink">{row.targetPct}%</span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-bone">
                          <div className="h-1 rounded-full bg-ink" style={{ width: `${Math.min(100, Math.max(0, row.targetPct))}%` }} />
                        </div>
                      </div>
                      <dl className="hidden items-center gap-4 lg:flex">
                        {row.stats.map((stat) => (
                          <div key={stat.label} className="text-right">
                            <dt className="sr-only">{stat.label}</dt>
                            <dd className="text-[13px] font-medium tabular-nums text-ink">{stat.value}</dd>
                            <dd className="text-[10px] text-stone">{stat.label}</dd>
                          </div>
                        ))}
                      </dl>
                      <span className="shrink-0 rounded-full bg-bone px-2 py-0.5 text-[10px] font-medium text-graphite">
                        {row.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl px-4 py-6 text-[13px] text-graphite ring-1 ring-line">
                No team members have activity yet.
              </p>
            )}
          </V4Panel>
        </div>

        {data.activityDaily && data.activityDaily.length > 0 && (
          <>
            <div className="lg:col-span-7">
              <V4Panel className="h-full">
                <V4PanelHeader eyebrow="Activity" title="Team activity — last 12 weeks" />
                <div className="mt-4">
                  <ContributionHeatmap daily={data.activityDaily} unit="actions" />
                </div>
              </V4Panel>
            </div>
            <div className="lg:col-span-5">
              <V4Panel className="h-full">
                <V4PanelHeader eyebrow="Performance" title="Last 30 days" />
                <div className="mt-4">
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
              </V4Panel>
            </div>
          </>
        )}

        {/* Important activity */}
        <div className="lg:col-span-12">
          <V4Panel>
            <V4PanelHeader
              eyebrow="Activity"
              title="Important organization events"
              action={
                <Link href="/team/activity" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  All activity <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {activity.length > 0 ? (
              <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                {activity.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href ?? '#'} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bone">
                      <span suppressHydrationWarning className="w-10 shrink-0 text-right text-[11px] font-medium tabular-nums text-stone">{item.time}</span>
                      <span className="flex w-3 shrink-0 flex-col items-center" aria-hidden>
                        <span className="mt-1 size-1.5 rounded-full bg-orange" />
                        <span className="w-px flex-1 bg-line" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{item.label}</span>
                        {item.detail && <span className="block truncate text-[11px] text-graphite">{item.detail}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl px-4 py-6 text-[13px] text-graphite ring-1 ring-line">
                No meaningful organization events this week.
              </p>
            )}
          </V4Panel>
        </div>
      </div>

      <section aria-label="Quick actions">
        <V4Panel>
          <V4PanelHeader eyebrow="Quick actions" title="Operational shortcuts" />
          <ul className="mt-4 flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <li key={action.key}>
                <Link
                  href={action.href}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bone-raised px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-bone"
                >
                  {action.label}
                  <ChevronRight className="size-3.5 text-stone" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </V4Panel>
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
    <div className="overflow-hidden rounded-xl ring-1 ring-line">
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
              <Link href={row.href} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bone">
                <V4Avatar name={row.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-ink">{row.name}</span>
                    <span suppressHydrationWarning className="shrink-0 text-[13px] font-medium tabular-nums text-ink">
                      {row.values[metric]}
                    </span>
                  </span>
                  <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-bone" aria-hidden>
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

function ProfileRows({ rows }: { rows: ReturnType<typeof buildAdminProfileRows> }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl px-4 py-6 text-[13px] text-graphite ring-1 ring-line">
        No assigned profiles yet.
      </p>
    )
  }
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-line">
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
              className="grid grid-cols-2 items-center gap-x-2 gap-y-1 px-4 py-2.5 transition-colors hover:bg-bone sm:grid-cols-[minmax(0,1fr)_repeat(4,3.5rem)] sm:gap-2"
            >
              <span className="col-span-2 min-w-0 sm:col-span-1">
                <span className="block truncate text-[13px] font-medium text-ink">{row.name}</span>
                <span className="block text-[11px] text-stone">{row.channel}</span>
              </span>
              <span className="text-right text-[13px] tabular-nums text-ink">{row.leads}</span>
              <span className="text-right text-[13px] tabular-nums text-ink">
                {row.replies}
                {row.replyRate != null && <span className="ml-1 text-[11px] text-stone">{row.replyRate}%</span>}
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
