'use client'

/**
 * Relay V4 — Rep Home: the daily cockpit.
 *
 * A rep opens Relay and sees, in order: the day, the profiles they write as,
 * the next five actions, manager-assigned work, and today's remaining target.
 * Everything else lives one click away. No section is kept because it exists.
 */
import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { RepWorkspaceData } from '@/lib/rep-home/rep-workspace-data'
import type { UnifiedTask } from '@/lib/tasks/types'
import type { RepCoverageView } from '@/lib/coverage/load'
import type { DailyAction } from '@/lib/daily-actions/types'
import { projectDailyActions } from '@/lib/daily-actions/project'
import { REP_V3_PRIMARY_CTA } from '@/lib/rep-home/v3-present'
import { relativeWait } from '@/lib/rep-home/action-presentation'
import { selectAssignedOpenTasks, selectAssignedOverdueTasks } from '@/lib/tasks/rank-unified-tasks'
import { RepDayControl, repDayStartTime } from '@/components/coverage/rep-day-control'
import { RepProfilesToday } from '@/components/coverage/rep-profiles-today'
import {
  V4Panel,
  V4PanelHeader,
  V4PageHeader,
  V4PriorityMark,
} from '@/components/v4/primitives'

function toPriority(priority: UnifiedTask['priority']): 'critical' | 'high' | 'normal' | 'watch' {
  if (priority === 'CRITICAL') return 'critical'
  if (priority === 'HIGH') return 'high'
  if (priority === 'LOW') return 'watch'
  return 'normal'
}

/** Map the deterministic urgency class onto the existing visual priority scale. */
function fromUrgency(urgency: DailyAction['urgency']): UnifiedTask['priority'] {
  if (urgency === 'P0' || urgency === 'P1') return 'CRITICAL'
  if (urgency === 'P2') return 'HIGH'
  if (urgency === 'P6') return 'LOW'
  return 'NORMAL'
}

function actionLabel(action: DailyAction): string {
  switch (action.type) {
    case 'INBOX_REPLY':
      return 'Reply'
    case 'TASK':
      return 'Open task'
    case 'FOLLOW_UP':
      return 'Follow up'
    case 'TARGET':
      return 'Continue'
    case 'COVERAGE':
      return 'Review coverage'
    case 'READINESS':
      return 'Confirm access'
    case 'UPWORK':
      return 'Open job'
  }
}

/** Smart empty state: name the next thing that is not urgent, not a void. */
function upNextActionText(data: RepWorkspaceData): string {
  const profiles = data.profilesToday ?? []
  const next = profiles.find((p) => p.remaining > 0)
  if (next) {
    return `Next: continue ${next.name} · ${next.channels[0] ?? 'channel'} — ${next.remaining} actions remaining.`
  }
  if (data.repDay && data.repDay.state !== 'CLOSED') {
    return 'Next: close out today when you are done.'
  }
  return 'Next: no remaining target work today.'
}

export function V4RepHome({
  data,
  role,
  greeting,
  coverage,
  now,
}: {
  data: RepWorkspaceData
  role: 'admin' | 'rep' | 'sourcer' | 'manager'
  /** Server-computed in the viewer's timezone so SSR and hydration agree. */
  greeting: string
  /** Today's own + temporarily covered profiles. */
  coverage?: RepCoverageView | null
  /** Server-computed epoch so the projection is identical on both renders. */
  now?: number
}) {
  const unified = useMemo(() => data.unifiedTasks ?? [], [data.unifiedTasks])
  const assignedOpen = useMemo(() => selectAssignedOpenTasks(unified), [unified])
  const assignedOverdue = useMemo(() => selectAssignedOverdueTasks(unified), [unified])
  const assignedUnread = useMemo(
    () => assignedOpen.reduce((sum, task) => sum + (task.unreadCount ?? 0), 0),
    [assignedOpen],
  )
  // The single ordered action list: a pure projection over canonical facts.
  const nextActions = useMemo(
    () => projectDailyActions({ data, coverage: coverage ?? data.coverage, now: now ?? 0 }),
    [data, coverage, now],
  )

  const targetTotal = data.targetSummary?.totalTarget ?? 0
  const targetDone = data.targetSummary?.totalCompleted ?? 0
  const targetRemaining = data.targetSummary?.totalRemaining ?? 0
  const started = repDayStartTime(data.repDay)

  return (
    <div className="space-y-6">
      <V4PageHeader
        eyebrow="Home / Today"
        title={`Good ${greeting}, ${data.rep.name.split(' ')[0]}`}
        subtitle="Your day, your profiles, your next move."
        meta={
          <>
            <RepDayControl repDay={data.repDay} />
            {started && <span className="text-[12px] text-graphite">Started {started}</span>}
            <span className="hidden h-3 w-px bg-line sm:block" aria-hidden />
            <p suppressHydrationWarning className="text-[12px] text-graphite">
              <span className="font-medium text-ink">{targetDone}</span>
              <span className="text-stone"> / {targetTotal} complete</span>
              <span className="text-stone"> · </span>
              <span className="font-medium text-ink">{targetRemaining}</span>
              <span className="text-stone"> remaining</span>
            </p>
            <span className="hidden h-3 w-px bg-line sm:block" aria-hidden />
            <Link
              href="/chats?view=waiting_me"
              className="text-[12px] font-medium text-status-warning transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
            >
              <span className="font-medium text-ink">{data.day.repliesWaiting}</span>
              <span className="text-stone"> replies waiting</span>
            </Link>
            <span className="hidden h-3 w-px bg-line sm:block" aria-hidden />
            <Link
              href="/chats?view=waiting_them"
              className="text-[12px] text-graphite transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
            >
              <span className="font-medium text-ink">{data.day.waitingOnClient}</span>
              <span className="text-stone"> waiting on clients</span>
            </Link>
            <span className="hidden h-3 w-px bg-line sm:block" aria-hidden />
            <Link
              href="/chats?view=followups"
              className="text-[12px] text-graphite transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
            >
              <span className="font-medium text-ink">{data.day.followUpsDue}</span>
              <span className="text-stone"> follow-ups due</span>
            </Link>
          </>
        }
        actions={
          <>
            <Link
              href={REP_V3_PRIMARY_CTA.href}
              className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3.5 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
            >
              {REP_V3_PRIMARY_CTA.label}
            </Link>
            <Link
              href="/chats"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
            >
              Open Inbox
            </Link>
          </>
        }
      />

      <section aria-label="Your profiles">
        <RepProfilesToday
          coverage={coverage ?? data.coverage}
          profilesToday={data.profilesToday}
          role={role}
        />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="Do this next"
              title="Your next 5 actions"
              hint="Ranked in canonical order"
              action={
                <Link
                  href="/tasks?view=today"
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
                >
                  My work <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {nextActions.length > 0 ? (
              <ol className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                {nextActions.map((action: DailyAction, index) => (
                  <li key={action.id}>
                    <Link
                      href={action.destination}
                      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
                    >
                      <span className="w-6 shrink-0 pt-0.5 text-[11px] font-medium tabular-nums text-stone">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium text-graphite">{action.profile}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <V4PriorityMark priority={toPriority(fromUrgency(action.urgency))} />
                          <p className="text-[13px] font-medium text-ink">{action.subject}</p>
                        </div>
                        <p className="mt-0.5 text-[12px] text-graphite">{action.reason}</p>
                        <p className="mt-1 text-[11px] text-stone">{action.age}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-bone-raised px-2 py-1 text-[11px] font-medium text-ink">
                        {actionLabel(action)}
                        <ChevronRight className="size-3" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-4 rounded-xl px-4 py-5 ring-1 ring-line">
                <p className="text-[13px] font-medium text-ink">You&apos;re caught up on urgent work.</p>
                <p className="mt-1 text-[12px] text-graphite">
                  {upNextActionText(data)}
                </p>
              </div>
            )}
          </V4Panel>
        </div>

        <div className="lg:col-span-5">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="Assigned to me"
              title="Work your manager gave you"
              hint={`${assignedOpen.length} open${assignedOverdue.length > 0 ? ` · ${assignedOverdue.length} overdue` : ''}${assignedUnread > 0 ? ` · ${assignedUnread} unread` : ''}`}
              action={
                <Link
                  href="/tasks?source=ASSIGNED&view=all"
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
                >
                  View all <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {assignedOpen.length === 0 ? (
              <p className="mt-4 rounded-xl px-4 py-6 text-[13px] text-graphite ring-1 ring-line">
                No manager-assigned tasks today.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                {assignedOpen.slice(0, 3).map((task) => (
                  <li key={task.id}>
                    <Link
                      href={task.action.href}
                      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <V4PriorityMark priority={toPriority(task.priority)} />
                          <p className="truncate text-[13px] font-medium text-ink">{task.title}</p>
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-graphite">
                          {task.createdByName
                            ? `Assigned by ${task.createdByName}`
                            : [task.companyName, task.profileName].filter(Boolean).join(' · ') || 'Assigned to you'}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-stone">
                          {(task.unreadCount ?? 0) > 0 && task.latestComment ? (
                            <>
                              <span className="font-medium text-ink">New comment</span>
                              {' · '}
                              <span suppressHydrationWarning>{relativeWait(task.latestComment.createdAt)}</span>
                            </>
                          ) : task.status === 'WAITING' ? (
                            `Waiting${task.waitingOn ? ` · ${task.waitingOn}` : ''}`
                          ) : task.latestComment ? (
                            `${task.latestComment.authorName ?? 'Update'}: ${task.latestComment.body}`
                          ) : (
                            'No discussion yet'
                          )}
                        </p>
                        <p suppressHydrationWarning className="mt-0.5 text-[11px] text-stone">
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
            )}
          </V4Panel>
        </div>
      </div>

      <section aria-label="Today's progress">
        <V4Panel>
          <V4PanelHeader
            eyebrow="Today"
            title="Daily progress"
            hint={targetTotal > 0 ? `${targetRemaining} remaining` : 'No daily target set'}
          />
          {targetTotal > 0 ? (
            <div className="mt-4 flex items-center gap-4">
              <p className="shrink-0 text-[13px] text-graphite">
                <span className="text-[22px] font-semibold leading-none tabular-nums text-ink">{targetDone}</span>
                <span className="text-stone"> / {targetTotal} complete</span>
              </p>
              <div
                className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-bone ring-1 ring-line/70"
                role="progressbar"
                aria-valuenow={targetTotal > 0 ? Math.min(100, Math.round((targetDone / targetTotal) * 100)) : 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Today's target completion"
              >
                <div
                  className="h-full rounded-full bg-orange transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{
                    width: `${targetTotal > 0 ? Math.min(100, Math.round((targetDone / targetTotal) * 100)) : 0}%`,
                  }}
                />
              </div>
              <span className="shrink-0 text-[13px] font-medium tabular-nums text-ink">
                {Math.min(100, Math.round((targetDone / targetTotal) * 100))}%
              </span>
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-graphite">No daily target set for today.</p>
          )}
        </V4Panel>
      </section>

      <section aria-label="More">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/reports/activity"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
          >
            Recent activity <ChevronRight className="size-3.5" aria-hidden />
          </Link>
          <Link
            href="/reports/sales"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
          >
            More insights <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  )
}
