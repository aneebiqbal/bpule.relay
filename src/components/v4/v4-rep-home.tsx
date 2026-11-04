'use client'

/**
 * Relay V4 — Rep Home: the execution cockpit.
 *
 * Above the fold a rep sees TODAY, ASSIGNED TO ME and DO THIS NEXT — in that
 * order. Charts answer "how am I doing" and never push the work down. Every
 * number is a canonical count; assigned work is separated from Relay-generated
 * work using the existing UnifiedTask source contract.
 */
import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { RepWorkspaceData } from '@/lib/rep-home/rep-workspace-data'
import type { UnifiedTask } from '@/lib/tasks/types'
import {
  buildRepV3Actions,
  buildRepV3Activity,
  buildRepV3Stages,
  buildRepTargetWindows,
  buildRepWorkBreakdown,
  countRepV3DueToday,
  deriveRepV3MetricInput,
  formatOverdueBreakdown,
  REP_V3_EMPTY_STATE,
  REP_V3_PRIMARY_CTA,
  REP_TREND_SERIES,
  type RepTargetWindow,
} from '@/lib/rep-home/v3-present'
import { rankActions, relativeWait } from '@/lib/rep-home/action-presentation'
import { selectAssignedOpenTasks, selectAssignedOverdueTasks } from '@/lib/tasks/rank-unified-tasks'
import { ProfileSwitcher } from '@/components/shell/profile-switcher'
import { ContributionHeatmap } from '@/components/performance/contribution-heatmap'
import {
  V3CompareBars,
  V3ProgressBlock,
  V3TrendChart,
  V3Value,
} from '@/components/v3/visuals'
import { V3StageStrip } from '@/components/v3/primitives'
import {
  V4Avatar,
  V4Empty,
  V4PageHeader,
  V4Panel,
  V4PanelHeader,
  V4PriorityMark,
  V4StatStrip,
} from '@/components/v4/primitives'

const TREND_COLORS: Record<string, string> = {
  replies: 'var(--orange)',
  meetings: 'var(--cobalt)',
  tasks: 'var(--ink)',
}

type AssignedGroup = {
  key: string
  label: string
  tasks: UnifiedTask[]
}

/**
 * Group open assigned work by its author. Only real assignments live here —
 * Relay-generated queue work is a separate kind and never labelled as assigned.
 */
function groupAssignedWork(tasks: UnifiedTask[]): AssignedGroup[] {
  // Caller passes the canonical open-assigned selection; no second predicate here.
  const groups = new Map<string, AssignedGroup>()
  for (const task of tasks) {
    const key = task.createdByName ?? 'Unknown'
    const group = groups.get(key) ?? { key, label: key, tasks: [] }
    group.tasks.push(task)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => b.tasks.length - a.tasks.length)
}

function toPriority(priority: UnifiedTask['priority']): 'critical' | 'high' | 'normal' | 'watch' {
  if (priority === 'CRITICAL') return 'critical'
  if (priority === 'HIGH') return 'high'
  if (priority === 'LOW') return 'watch'
  return 'normal'
}

export function V4RepHome({
  data,
  role,
}: {
  data: RepWorkspaceData
  role: 'admin' | 'rep' | 'sourcer' | 'manager'
}) {
  const ranked = useMemo(() => rankActions(data.allActions ?? []), [data.allActions])
  const unified = useMemo(() => data.unifiedTasks ?? [], [data.unifiedTasks])
  const assignedOpen = useMemo(() => selectAssignedOpenTasks(unified), [unified])
  const assignedOverdue = useMemo(() => selectAssignedOverdueTasks(unified), [unified])
  const assignedGroups = useMemo(() => groupAssignedWork(assignedOpen.slice(0, 5)), [assignedOpen])

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

  const stats: Array<{ key: string; label: string; value: number; hint: string; href: string; tone: 'neutral' | 'danger' | 'warning' | 'success' }> = [
    { key: 'completed', label: 'Completed', value: targetDone, hint: targetTotal > 0 ? `of ${targetTotal} target` : 'No daily target', href: '/dashboard', tone: targetTotal > 0 && targetDone >= targetTotal ? 'success' : 'neutral' },
    { key: 'assigned', label: 'Assigned to me', value: assignedOpen.length, hint: assignedOverdue.length > 0 ? `${assignedOverdue.length} overdue` : 'Open work', href: '/tasks', tone: assignedOverdue.length > 0 ? 'danger' : assignedOpen.length > 0 ? 'warning' : 'neutral' },
    { key: 'replies', label: 'Replies waiting', value: data.day?.repliesWaiting ?? metricInput.repliesWaiting, hint: data.day?.repliesWaiting ? 'Need an answer' : 'Inbox clear', href: '/chats', tone: data.day?.repliesWaiting ? 'warning' : 'neutral' },
    { key: 'overdue', label: 'Overdue', value: metricInput.followUpsOverdue + assignedOverdue.length, hint: formatOverdueBreakdown(metricInput.followUpsOverdue, assignedOverdue.length), href: '/tasks?view=overdue', tone: metricInput.followUpsOverdue + assignedOverdue.length > 0 ? 'danger' : 'neutral' },
    { key: 'meetings', label: 'Meetings', value: todayActivity?.breakdown.meetings ?? data.outcomeEvents?.meetings ?? 0, hint: 'Booked today', href: '/reports/sales', tone: 'neutral' },
  ]

  return (
    <div className="space-y-8">
      <V4PageHeader
        eyebrow="Home / Today"
        title={`Good ${greeting()}, ${data.rep.name.split(' ')[0]}`}
        subtitle="Your execution cockpit for today."
        meta={
          <>
            {data.activeWorkspace && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-graphite">
                <span className="text-stone">Working as</span>
                <span className="font-medium text-ink">{data.activeWorkspace.identityName}</span>
              </span>
            )}
            <span className="hidden h-3 w-px bg-line sm:block" aria-hidden />
            <p suppressHydrationWarning className="text-[12px] text-graphite">
              <span className="font-medium text-ink">{targetDone}</span> completed
              <span className="text-stone"> · </span>
              <span className="font-medium text-ink">{targetRemaining}</span> remaining
            </p>
            <span className="hidden lg:inline-flex">
              <ProfileSwitcher role={role} compact />
            </span>
          </>
        }
        actions={
          <>
            <Link
              href={REP_V3_PRIMARY_CTA.href}
              className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3.5 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
            >
              {REP_V3_PRIMARY_CTA.label}
            </Link>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone"
            >
              Create Task
            </Link>
          </>
        }
      />

      <section aria-label="Today">
        <V4StatStrip items={stats} label="Today" />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
        {/* Assigned to me — impossible to miss. */}
        <div className="lg:col-span-5">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="Assigned to me"
              title="Work someone gave you"
              hint={`${assignedOpen.length} open`}
              action={
                <Link href="/tasks?source=ASSIGNED&view=all" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  View all assigned work <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {assignedGroups.length === 0 ? (
              <div className="mt-4">
                <V4Empty
                  title="No assigned work"
                  body="When a manager or admin assigns you a task, it appears here before anywhere else. Relay-generated suggestions live in Do this next."
                >
                  <Link href="/tasks" className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid">
                    Open my work
                  </Link>
                </V4Empty>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {assignedGroups.map((group) => (
                  <div key={group.key}>
                    <div className="flex items-center gap-2">
                      <V4Avatar name={group.label} size="sm" />
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Assigned by {group.label}</p>
                      <span className="rounded-full bg-bone px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-graphite">
                        {group.tasks.length}
                      </span>
                    </div>
                    <ul className="mt-2 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                      {group.tasks.slice(0, 4).map((task) => (
                        <li key={task.id}>
                          <Link
                            href={task.action.href}
                            className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-bone"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <V4PriorityMark priority={toPriority(task.priority)} />
                                <p className="truncate text-[13px] font-medium text-ink">{task.title}</p>
                              </div>
                              <p className="mt-0.5 truncate text-[12px] text-graphite">
                                {[task.companyName, task.profileName].filter(Boolean).join(' · ')}
                              </p>
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-stone">{task.reason}</p>
                              <p suppressHydrationWarning className="mt-1 text-[11px] text-stone">
                                {task.dueAt ? `Due ${relativeWait(task.dueAt)}` : `Assigned ${relativeWait(task.createdAt)}`}
                              </p>
                            </div>
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-solid px-2 py-1 text-[11px] font-medium text-on-solid">
                              {task.action.label}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </V4Panel>
        </div>

        {/* Do this next — canonical ranking. */}
        <div className="lg:col-span-7">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="Do this next"
              title="Ranked for you"
              hint="Canonical next-best-action order"
              action={
                <Link href="/tasks" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  My work <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {actions.length > 0 ? (
              <ol className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                {actions.map((action, index) => (
                  <li key={`${action.id}-${index}`}>
                    <Link
                      href={action.href}
                      className="flex items-start gap-3 px-3 py-3 transition-colors hover:bg-bone"
                    >
                      <span className="w-6 shrink-0 pt-0.5 text-[11px] font-medium tabular-nums text-stone">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <V4PriorityMark priority={action.priority} />
                          <p className="text-[13px] font-medium text-ink">{action.title}</p>
                        </div>
                        {action.context && <p className="mt-0.5 truncate text-[12px] text-graphite">{action.context}</p>}
                        {action.whyNow && <p className="mt-0.5 text-[11px] text-stone">{action.whyNow}</p>}
                        <p suppressHydrationWarning className="mt-1 text-[11px] text-stone">{action.age}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-bone-raised px-2 py-1 text-[11px] font-medium text-ink">
                        {action.ctaLabel}
                        <ChevronRight className="size-3" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-4">
                <V4Empty title={REP_V3_EMPTY_STATE.title} body={REP_V3_EMPTY_STATE.body}>
                  <Link href={REP_V3_EMPTY_STATE.href} className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid">
                    {REP_V3_EMPTY_STATE.cta}
                  </Link>
                </V4Empty>
              </div>
            )}
          </V4Panel>
        </div>

        {/* Pipeline pulse */}
        <div className="lg:col-span-7">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="Pipeline"
              title="Open opportunities by stage"
              hint="Status snapshots, not funnel transitions"
              action={
                <Link href="/leads?view=pipeline" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  Pipeline <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            <div className="mt-4">
              <V3StageStrip stages={stages} />
            </div>
          </V4Panel>
        </div>

        {/* Progress */}
        <div className="lg:col-span-5">
          <V4Panel className="h-full">
            <V4PanelHeader eyebrow="Target" title="Today's progress" />
            <div className="mt-4">
              <V3ProgressBlock
                done={targetDone}
                target={targetTotal}
                label="Today's progress"
                remainingLabel="remaining"
                doneLabel="Target completions — drafts and failed sends never count."
              />
            </div>
            {targetWindows && (
              <div className="mt-4 border-t border-line/70 pt-4">
                <TargetWindows rows={targetWindows} />
              </div>
            )}
          </V4Panel>
        </div>

        {/* My work breakdown */}
        <div className="lg:col-span-5">
          <V4Panel className="h-full">
            <V4PanelHeader eyebrow="My work" title="Open, by category" />
            <div className="mt-4">
              <V3CompareBars rows={breakdown} label="My work breakdown" />
            </div>
          </V4Panel>
        </div>

        {/* Recent activity */}
        <div className="lg:col-span-7">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="Activity"
              title="Recent operational events"
              action={
                <Link href="/reports/activity" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  View activity <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {activity.length > 0 ? (
              <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                {activity.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href ?? '#'} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-bone">
                      <span className="w-10 shrink-0 text-right text-[11px] font-medium tabular-nums text-stone">{item.time}</span>
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
                No operational events yet today.
              </p>
            )}
          </V4Panel>
        </div>

        {daily.length > 0 && (
          <>
            <div className="lg:col-span-7">
              <V4Panel className="h-full">
                <V4PanelHeader eyebrow="Activity" title="Last 12 weeks" />
                <div className="mt-4">
                  <ContributionHeatmap daily={daily} dayHref="/performance?range=12w&date={date}" />
                </div>
              </V4Panel>
            </div>
            <div className="lg:col-span-5">
              <V4Panel className="h-full">
                <V4PanelHeader eyebrow="Performance" title="Are you improving?" />
                <div className="mt-4">
                  {data.trendPoints && data.trendPoints.length > 0 ? (
                    <V3TrendChart points={data.trendPoints} series={trendSeries} label="Performance trend" />
                  ) : (
                    <p className="py-6 text-center text-[12px] text-stone">No trend data yet.</p>
                  )}
                </div>
              </V4Panel>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TargetWindows({ rows }: { rows: RepTargetWindow[] }) {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-line">
      <ul className="divide-y divide-line/70">
        {rows.map((row) => (
          <li key={row.key} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-medium text-ink">
                {row.label}
                {row.derived && (
                  <span className="ml-2 rounded-full bg-bone px-1.5 py-0.5 text-[10px] font-medium text-stone">derived</span>
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
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-bone" aria-hidden>
              <div
                className="h-full rounded-full bg-orange transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ width: `${Math.min(100, Math.max(0, row.pct ?? 0))}%` }}
              />
            </div>
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
