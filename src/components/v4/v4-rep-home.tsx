'use client'

/**
 * Relay V4 — Rep Home: the daily execution screen.
 *
 * Deliberately short. A rep opens it and sees, in order: the day control, the
 * numbers that matter, the profiles they may work (with access confirmed in a
 * pop-up, not a wall of cards), their next five actions, and any work someone
 * assigned them. Everything else lives one click away.
 */
import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { RepWorkspaceData } from '@/lib/rep-home/rep-workspace-data'
import type { RepCoverageView } from '@/lib/coverage/load'
import type { UnifiedTask } from '@/lib/tasks/types'
import {
  buildRepV3Actions,
  countRepV3DueToday,
  deriveRepV3MetricInput,
  formatOverdueBreakdown,
  REP_V3_EMPTY_STATE,
  REP_V3_PRIMARY_CTA,
} from '@/lib/rep-home/v3-present'
import { rankActions, relativeWait } from '@/lib/rep-home/action-presentation'
import { selectAssignedOpenTasks, selectAssignedOverdueTasks } from '@/lib/tasks/rank-unified-tasks'
import { RepHomeProfiles } from '@/components/coverage/rep-home-profiles'
import { RepDayControl } from '@/components/coverage/rep-day-control'
import {
  V4Empty,
  V4PageHeader,
  V4Panel,
  V4PanelHeader,
  V4PriorityMark,
  V4StatStrip,
} from '@/components/v4/primitives'

function toPriority(priority: UnifiedTask['priority']): 'critical' | 'high' | 'normal' | 'watch' {
  if (priority === 'CRITICAL') return 'critical'
  if (priority === 'HIGH') return 'high'
  if (priority === 'LOW') return 'watch'
  return 'normal'
}

export function V4RepHome({
  data,
  role,
  greeting,
  coverage,
}: {
  data: RepWorkspaceData
  role: 'admin' | 'rep' | 'sourcer' | 'manager'
  /** Server-computed in the viewer's timezone so SSR and hydration agree. */
  greeting: string
  /** Org timezone — the one zone the server and client both render in. */
  timeZone?: string
  /** Today's own + temporarily covered profiles. */
  coverage?: RepCoverageView | null
}) {
  const ranked = useMemo(() => rankActions(data.allActions ?? []), [data.allActions])
  const unified = useMemo(() => data.unifiedTasks ?? [], [data.unifiedTasks])
  const assignedOpen = useMemo(() => selectAssignedOpenTasks(unified), [unified])
  const assignedOverdue = useMemo(() => selectAssignedOverdueTasks(unified), [unified])

  const tasksDueToday = useMemo(() => countRepV3DueToday(unified), [unified])
  const metricInput = useMemo(
    () => deriveRepV3MetricInput({ ranked, openTasks: unified.length, tasksDueToday }),
    [ranked, unified.length, tasksDueToday],
  )
  const actions = useMemo(() => buildRepV3Actions(unified, ranked).slice(0, 5), [unified, ranked])

  const targetTotal = data.targetSummary?.totalTarget ?? 0
  const targetDone = data.targetSummary?.totalCompleted ?? 0
  const targetRemaining = data.targetSummary?.totalRemaining ?? 0

  const stats: Array<{
    key: string
    label: string
    value: number
    hint: string
    href: string
    tone: 'neutral' | 'danger' | 'warning' | 'success'
  }> = [
    {
      key: 'replies',
      label: 'Replies waiting',
      value: data.day?.repliesWaiting ?? metricInput.repliesWaiting,
      hint: data.day?.repliesWaiting ? 'Need an answer' : 'Inbox clear',
      href: '/chats',
      tone: data.day?.repliesWaiting ? 'warning' : 'neutral',
    },
    {
      key: 'overdue',
      label: 'Overdue',
      value: metricInput.followUpsOverdue + assignedOverdue.length,
      hint: formatOverdueBreakdown(metricInput.followUpsOverdue, assignedOverdue.length),
      href: '/tasks?view=overdue',
      tone: metricInput.followUpsOverdue + assignedOverdue.length > 0 ? 'danger' : 'neutral',
    },
    {
      key: 'assigned',
      label: 'Assigned to me',
      value: assignedOpen.length,
      hint: assignedOverdue.length > 0 ? `${assignedOverdue.length} overdue` : 'Open work',
      href: '/tasks',
      tone: assignedOverdue.length > 0 ? 'danger' : assignedOpen.length > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'followups',
      label: 'Follow-ups due',
      value: data.day?.followUpsDue ?? metricInput.followUpsOverdue,
      hint: 'Profile follow-ups',
      href: '/chats',
      tone: (data.day?.followUpsDue ?? 0) > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'meetings',
      label: 'Meetings today',
      value: data.outcomeEvents?.meetings ?? 0,
      hint: 'Booked today',
      href: '/reports/sales',
      tone: 'neutral',
    },
  ]

  return (
    <div className="space-y-6">
      <V4PageHeader
        eyebrow="Home / Today"
        title={`Good ${greeting}, ${data.rep.name.split(' ')[0]}`}
        subtitle="Your profiles, your next actions, your day."
        meta={
          <p suppressHydrationWarning className="text-[12px] text-graphite">
            <span className="font-medium text-ink">{targetDone}</span> of{' '}
            <span className="font-medium text-ink">{targetTotal}</span> target completed
            <span className="text-stone"> · </span>
            <span className="font-medium text-ink">{targetRemaining}</span> remaining
          </p>
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
              My work
            </Link>
          </>
        }
      />

      <RepDayControl repDay={data.repDay} />

      <section aria-label="Today">
        <V4StatStrip items={stats} label="Today" />
      </section>

      <section aria-label="Your profiles">
        <RepHomeProfiles
          coverage={coverage ?? data.coverage}
          profilesToday={data.profilesToday}
          role={role}
        />
      </section>

      <section aria-label="Do this next">
        <V4Panel>
          <V4PanelHeader
            eyebrow="Do this next"
            title="Your next 5 actions"
            hint="Ranked in canonical order"
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
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-bone"
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
                <Link
                  href={REP_V3_EMPTY_STATE.href}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid"
                >
                  {REP_V3_EMPTY_STATE.cta}
                </Link>
              </V4Empty>
            </div>
          )}
        </V4Panel>
      </section>

      {assignedOpen.length > 0 && (
        <section aria-label="Assigned to me">
          <V4Panel>
            <V4PanelHeader
              eyebrow="Assigned to me"
              title="Work someone gave you"
              hint={`${assignedOpen.length} open`}
              action={
                <Link
                  href="/tasks?source=ASSIGNED&view=all"
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink"
                >
                  View all <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
              {assignedOpen.slice(0, 3).map((task) => (
                <li key={task.id}>
                  <Link
                    href={task.action.href}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-bone"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <V4PriorityMark priority={toPriority(task.priority)} />
                        <p className="truncate text-[13px] font-medium text-ink">{task.title}</p>
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-graphite">
                        {[task.companyName, task.profileName].filter(Boolean).join(' · ')}
                      </p>
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
          </V4Panel>
        </section>
      )}
    </div>
  )
}
