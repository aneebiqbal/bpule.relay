'use client'

/**
 * Rep Home V3 — the daily execution command center.
 *
 * Ten sections in mobile order: header, today metrics, progress, do this next,
 * my work, pipeline pulse, activity heatmap, trend, targets, recent activity.
 * Execution stays dominant; the visuals only answer "how am I doing".
 */
import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { RepWorkspaceData } from '@/lib/rep-home/rep-workspace-data'
import {
  buildRepTodayMetrics,
  buildRepV3Actions,
  buildRepV3Activity,
  buildRepV3Stages,
  buildRepTargetWindows,
  buildRepWorkBreakdown,
  countRepV3DueToday,
  deriveRepV3MetricInput,
  REP_V3_EMPTY_STATE,
  REP_V3_PRIMARY_CTA,
  REP_TREND_SERIES,
  type RepTargetWindow,
} from '@/lib/rep-home/v3-present'
import { rankActions } from '@/lib/rep-home/action-presentation'
import { ProfileSwitcher } from '@/components/shell/profile-switcher'
import { ContributionHeatmap } from '@/components/performance/contribution-heatmap'
import {
  V3ActionRow,
  V3ActivityRow,
  V3EmptyState,
  V3PageHeader,
  V3SectionTitle,
  V3StageStrip,
} from '@/components/v3/primitives'
import {
  V3CompareBars,
  V3MetricStrip,
  V3ProgressBlock,
  V3TrendChart,
  V3Value,
} from '@/components/v3/visuals'

const TREND_COLORS: Record<string, string> = {
  replies: 'var(--orange)',
  meetings: 'var(--cobalt)',
  tasks: 'var(--ink)',
}

export function RepHomeView({ data, role }: { data: RepWorkspaceData; role: 'admin' | 'rep' | 'sourcer' | 'manager' }) {
  const ranked = useMemo(() => rankActions(data.allActions ?? []), [data.allActions])
  const unified = useMemo(() => data.unifiedTasks ?? [], [data.unifiedTasks])

  const tasksDueToday = useMemo(() => countRepV3DueToday(unified), [unified])
  const metricInput = useMemo(
    () => deriveRepV3MetricInput({ ranked, openTasks: unified.length, tasksDueToday }),
    [ranked, unified.length, tasksDueToday],
  )
  const actions = useMemo(() => buildRepV3Actions(unified, ranked), [unified, ranked])
  const stages = useMemo(() => buildRepV3Stages(data.pipelineLeads ?? []), [data.pipelineLeads])
  const activity = useMemo(() => buildRepV3Activity(data.activity ?? []), [data.activity])
  const breakdown = useMemo(() => buildRepWorkBreakdown(unified, ranked), [unified, ranked])

  const daily = data.activityDaily ?? []
  const todayActivity = daily.length > 0 ? daily[daily.length - 1] : null

  const targetTotal = data.targetSummary?.totalTarget ?? 0
  const targetDone = data.targetSummary?.totalCompleted ?? 0
  const targetRemaining = data.targetSummary?.totalRemaining ?? 0

  const todayMetrics = useMemo(
    () =>
      buildRepTodayMetrics({
        completedToday: targetDone,
        targetTotal,
        repliesHandledToday: todayActivity?.breakdown.replies ?? null,
        followupsCompletedToday: todayActivity?.breakdown.followups ?? null,
        tasksCompletedToday: data.tasksCompletedToday ?? null,
        meetingsToday: todayActivity?.breakdown.meetings ?? data.outcomeEvents?.meetings ?? null,
        repliesWaiting: data.day?.repliesWaiting ?? metricInput.repliesWaiting,
        followUpsDue: data.day?.followUpsDue ?? metricInput.followUpsDue,
        followUpsOverdue: metricInput.followUpsOverdue,
        tasksDueToday,
      }),
    [targetDone, targetTotal, todayActivity, data.tasksCompletedToday, data.outcomeEvents, data.day, metricInput, tasksDueToday],
  )

  const targetWindows = useMemo(
    () =>
      data.targetWindows
        ? buildRepTargetWindows({
            dailyDone: data.targetWindows.dailyDone,
            dailyTarget: data.targetWindows.dailyTarget,
            weeklyDone: data.targetWindows.weeklyDone,
            weeklyWorkingDays: data.targetWindows.weeklyWorkingDays,
            monthlyDone: data.targetWindows.monthlyDone,
            monthlyWorkingDays: data.targetWindows.monthlyWorkingDays,
          })
        : null,
    [data.targetWindows],
  )

  const trendSeries = REP_TREND_SERIES.map((series) => ({
    key: series.key,
    label: series.label,
    color: TREND_COLORS[series.key] ?? 'var(--ink)',
  }))

  return (
    <div className="space-y-8 pb-10">
      <V3PageHeader
        title={`Good ${greeting()}, ${data.rep.name.split(' ')[0]}`}
        subtitle="Your workspace for today"
        meta={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {data.activeWorkspace && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-graphite">
                <span className="text-stone">Working as</span>
                <span className="font-medium text-ink">{data.activeWorkspace.identityName}</span>
              </span>
            )}
            <span className="hidden h-3 w-px bg-line sm:block" aria-hidden="true" />
            <p suppressHydrationWarning className="text-[13px] text-graphite">
              Today: <span className="font-medium text-ink">{targetDone} completed</span>
              <span className="text-stone"> · </span>
              <span className="font-medium text-ink">{targetRemaining} remaining</span>
            </p>
            <span className="hidden lg:inline-flex">
              <ProfileSwitcher role={role} compact />
            </span>
          </div>
        }
        actions={
          <>
            <Link
              href={REP_V3_PRIMARY_CTA.href}
              className="inline-flex items-center gap-1.5 rounded-md bg-solid px-3.5 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
            >
              {REP_V3_PRIMARY_CTA.label}
            </Link>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone"
            >
              Create Task
            </Link>
          </>
        }
      />

      <section aria-label="Today's performance">
        <V3MetricStrip items={todayMetrics} label="Today's performance" />
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <section aria-label="Today's progress" className="h-full">
            <V3ProgressBlock
              done={targetDone}
              target={targetTotal}
              label="Today's progress"
              remainingLabel="remaining"
              doneLabel="Target completions — drafts and failed sends never count."
            />
          </section>
        </div>

        <div className="lg:col-span-8">
          <section aria-label="Do this next" className="h-full">
            <V3SectionTitle title="Do this next" hint="Ranked by urgency" />
            {actions.length > 0 ? (
              <ol className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-bone-raised">
                {actions.map((action, index) => (
                  <V3ActionRow
                    key={`${action.id}-${index}`}
                    rank={index + 1}
                    priority={action.priority}
                    title={action.title}
                    context={action.context || undefined}
                    whyNow={action.whyNow || undefined}
                    age={action.age || undefined}
                    ctaLabel={action.ctaLabel}
                    href={action.href}
                  />
                ))}
              </ol>
            ) : (
              <div className="mt-3">
                <V3EmptyState title={REP_V3_EMPTY_STATE.title} body={REP_V3_EMPTY_STATE.body}>
                  <Link
                    href={REP_V3_EMPTY_STATE.href}
                    className="inline-flex items-center gap-1.5 rounded-md bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid"
                  >
                    {REP_V3_EMPTY_STATE.cta}
                  </Link>
                </V3EmptyState>
              </div>
            )}
          </section>
        </div>

        <div className="lg:col-span-4">
          <section aria-label="My work breakdown" className="h-full">
            <V3SectionTitle title="My work" hint="Open, by category" />
            <div className="mt-3">
              <V3CompareBars rows={breakdown} label="My work breakdown" />
            </div>
          </section>
        </div>

        <div className="lg:col-span-8">
          <section aria-label="Pipeline pulse" className="h-full">
            <V3SectionTitle title="Pipeline pulse" hint="Open opportunities by stage" />
            <div className="mt-3">
              <V3StageStrip stages={stages} />
            </div>
          </section>
        </div>

        {daily.length > 0 && (
          <>
            <div className="lg:col-span-7">
              <section aria-label="Your activity" className="h-full">
                <V3SectionTitle title="Your activity" hint="Last 12 weeks" />
                <div className="mt-3 rounded-lg border border-line bg-bone-raised p-4">
                  <ContributionHeatmap
                    daily={daily}
                    dayHref="/performance?range=12w&date={date}"
                  />
                </div>
              </section>
            </div>

            <div className="lg:col-span-5">
              <section aria-label="Performance trend" className="h-full">
                <V3SectionTitle title="Performance" hint="Are you improving?" />
                <div className="mt-3 rounded-lg border border-line bg-bone-raised p-4">
                  {data.trendPoints && data.trendPoints.length > 0 ? (
                    <V3TrendChart points={data.trendPoints} series={trendSeries} label="Performance trend" />                  ) : (
                    <p className="py-6 text-center text-[12px] text-stone">No trend data yet.</p>
                  )}
                </div>
              </section>
            </div>
          </>
        )}

        {targetWindows && (
          <div className="lg:col-span-5">
            <section aria-label="Targets" className="h-full">
              <V3SectionTitle title="Targets" hint="Daily is configured; weekly and monthly are derived" />
              <div className="mt-3">
                <TargetWindows rows={targetWindows} />
              </div>
            </section>
          </div>
        )}

        <div className={targetWindows ? 'lg:col-span-7' : 'lg:col-span-12'}>
          <section aria-label="Recent activity" className="h-full">
            <V3SectionTitle title="Recent activity" hint="Latest operational events" />
            {activity.length > 0 ? (
              <>
                <ul className="mt-3 divide-y divide-line/70 overflow-hidden rounded-lg border border-line bg-bone-raised">
                  {activity.map((item) => (
                    <V3ActivityRow key={item.id} time={item.time} label={item.label} detail={item.detail ?? undefined} href={item.href ?? undefined} />
                  ))}
                </ul>
                <Link
                  href="/reports/activity"
                  className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
                >
                  View activity
                  <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              </>
            ) : (
              <p className="mt-3 rounded-lg border border-line bg-bone-raised px-4 py-6 text-[13px] text-graphite">
                No operational events yet today.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function TargetWindows({ rows }: { rows: RepTargetWindow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bone-raised">
      <ul className="divide-y divide-line/70">
        {rows.map((row) => (
          <li key={row.key} className="px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-medium text-ink">
                {row.label}
                {row.derived && (
                  <span className="ml-2 rounded-full bg-bone px-1.5 py-0.5 text-[10px] font-medium text-stone">
                    derived
                  </span>
                )}
              </p>
              <p suppressHydrationWarning className="text-[13px] tabular-nums text-graphite">
                <span className="font-medium text-ink">
                  <V3Value value={row.done} />
                </span>
                {' / '}
                {row.target}
                {row.pct != null && <span className="ml-1.5 text-stone">{row.pct}%</span>}
              </p>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-bone" aria-hidden="true">
              <div
                className="h-full rounded-full bg-orange transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ width: `${Math.min(100, Math.max(0, row.pct ?? 0))}%` }}
              />
            </div>
            {row.derived && (
              <p className="mt-1.5 text-[11px] text-stone">
                Daily target × working days elapsed.
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
