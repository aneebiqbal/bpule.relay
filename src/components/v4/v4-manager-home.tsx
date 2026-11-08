'use client'

/**
 * Relay V4 — Manager Home: the team-exception cockpit.
 *
 * Manager is not a smaller Admin. The page leads with the manager's own work,
 * then the team's exceptions, then workload and assigned-work status — the
 * questions a manager actually asks in order. All counts come from the canonical
 * Manager Home team contract; nothing is recomputed here.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import type { RepWorkspaceData } from '@/lib/rep-home/rep-workspace-data'
import type { ManagerHomeTeamData } from '@/lib/team/manager-home-summary'
import { RepCoveragePanel } from '@/components/coverage/rep-coverage-panel'
import {
  actionDeepLink,
  humanWhyNow,
  isHighPriorityOpportunity,
  primaryCtaLabel,
  rankActions,
  relativeWait,
} from '@/lib/rep-home/action-presentation'
import type { AttentionSeverity } from '@/lib/team/attention-policy'
import {
  V4Avatar,
  V4Chip,
  V4Empty,
  V4PageHeader,
  V4Panel,
  V4PanelHeader,
  V4StatStrip,
} from '@/components/v4/primitives'

function severityClass(severity: AttentionSeverity | string) {
  if (severity === 'critical' || severity === 'Critical') return 'bg-status-danger/10 text-[#8f2b1e]'
  if (severity === 'attention' || severity === 'Attention') return 'bg-status-warning/10 text-status-warning'
  return 'bg-status-success/10 text-status-success'
}

type TeamFilter = 'all' | 'replies' | 'followups' | 'priority' | 'attention'

export function V4ManagerHome({
  personal,
  team,
  error,
  greeting,
  timeZone = 'UTC',
}: {
  personal: RepWorkspaceData
  team: ManagerHomeTeamData
  error?: boolean
  /** Server-computed in the viewer's timezone so SSR and hydration agree. */
  greeting: string
  /** Org timezone — the one zone the server and client both render in. */
  timeZone?: string
}) {
  const [filter, setFilter] = useState<TeamFilter>('all')

  const ranked = useMemo(() => rankActions(personal.allActions ?? []), [personal.allActions])
  // Canonical Inbox counts over the manager's executable profiles — the same
  // authority Rep Home and /chats read.
  const myReplies = personal.day?.repliesWaiting ?? 0
  const myWaitingOnClients = personal.day?.waitingOnClient ?? 0
  const myFollowUps = personal.day?.followUpsDue ?? 0
  const highPriority = useMemo(() => ranked.filter(isHighPriorityOpportunity), [ranked])
  const doNext = ranked.slice(0, 5)
  const completedToday = personal.targetSummary?.totalCompleted ?? 0

  const filteredRows = useMemo(() => {
    if (filter === 'all') return team.rows
    if (filter === 'attention') return team.rows.filter((r) => r.status !== 'On track')
    if (filter === 'replies') return team.rows.filter((r) => r.repliesWaiting > 0)
    if (filter === 'followups') return team.rows.filter((r) => r.followUpsOverdue > 0)
    if (filter === 'priority') return team.rows.filter((r) => r.highPriority > 0)
    return team.rows
  }, [team.rows, filter])

  const stats: Array<{ key: string; label: string; value: number; hint: string; href: string; tone: 'neutral' | 'danger' | 'warning' | 'success' }> = [
    { key: 'my-replies', label: 'Replies waiting', value: myReplies, hint: 'Your inbox', href: '/chats?view=waiting_me', tone: myReplies > 0 ? 'warning' : 'neutral' },
    { key: 'my-waiting', label: 'Waiting on clients', value: myWaitingOnClients, hint: 'Your inbox', href: '/chats?view=waiting_them', tone: 'neutral' },
    { key: 'my-followups', label: 'Follow-ups due', value: myFollowUps, hint: 'Your queue', href: '/chats?view=followups', tone: myFollowUps > 0 ? 'warning' : 'neutral' },
    { key: 'my-priority', label: 'My high-priority', value: highPriority.length, hint: 'Your book', href: '/dashboard', tone: 'neutral' },
    { key: 'my-done', label: 'My completed today', value: completedToday, hint: 'Your targets', href: '/dashboard', tone: 'neutral' },
    { key: 'team-attention', label: 'Team attention', value: team.needsAttentionCount, hint: `${team.memberCount} people`, href: '/team', tone: team.needsAttentionCount > 0 ? 'danger' : 'neutral' },
  ]

  return (
    <div className="space-y-8">
      <V4PageHeader
        eyebrow="Home / Team"
        title={`Good ${greeting}, ${personal.rep.name.split(' ')[0]}`}
        subtitle={
          <>
            {team.teamName} · {team.memberCount} {team.memberCount === 1 ? 'person' : 'people'}
            {team.needsAttentionCount > 0 ? ` · ${team.needsAttentionCount} need attention` : ' · on track'}
          </>
        }
        meta={
          personal.activeWorkspace && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-graphite">
              <span className="text-stone">Working as</span>
              <span className="font-medium text-ink">{personal.activeWorkspace.identityName}</span>
              <span className="text-stone">· all your active profiles</span>
            </span>
          )
        }
        actions={
          <>
            <Link
              href="/tasks?scope=team"
              className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3.5 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
            >
              Assign Task
            </Link>
            <Link
              href="/team"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone"
            >
              Team overview
            </Link>
          </>
        }
      />

      {error && (
        <div role="alert" className="rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-[12px] text-graphite">
          Could not load some team data. Your personal work below is still available.
        </div>
      )}

      <section aria-label="Today">
        <V4StatStrip items={stats} label="Manager today" />
      </section>

      <section aria-label="Your responsibilities today">
        <RepCoveragePanel coverage={personal.coverage} repDay={personal.repDay} />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
        {/* My work */}
        <div className="lg:col-span-7">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="My work"
              title="Your personal queue"
              hint="Across your active profiles"
              action={
                <Link href="/dashboard" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  My home <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {doNext.length > 0 ? (
              <ol className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                {doNext.map((task, i) => (
                  <li key={`${task.id}-${i}`}>
                    <Link href={actionDeepLink(task)} className="flex items-start gap-3 px-3 py-3 transition-colors hover:bg-bone">
                      <span className="w-6 shrink-0 pt-0.5 text-[11px] font-medium tabular-nums text-stone">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">{task.title}</p>
                        <p className="mt-0.5 truncate text-[12px] text-graphite">{humanWhyNow(task)}</p>
                        {task.createdAt && <p suppressHydrationWarning className="mt-0.5 text-[11px] text-stone">{relativeWait(task.createdAt)}</p>}
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-solid px-2 py-1 text-[11px] font-medium text-on-solid">
                        {primaryCtaLabel(task)}
                        <ChevronRight className="size-3" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-4">
                <V4Empty title="You're clear personally" body="Focus on the team below." />
              </div>
            )}
          </V4Panel>
        </div>

        {/* Needs attention */}
        <div className="lg:col-span-5">
          <V4Panel className="h-full">
            <V4PanelHeader
              eyebrow="Needs attention"
              title="Team exceptions"
              hint={`${team.attention.length} signals`}
              action={
                <Link href="/team" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  All <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {team.attention.length === 0 ? (
              <div className="mt-4">
                <V4Empty title="Team is on track" body="No overdue replies, follow-ups or critical opportunities need attention." />
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                {team.attention.slice(0, 6).map((signal) => (
                  <li key={`${signal.repId}-${signal.category}`}>
                    <Link href={signal.href} className="flex items-start gap-3 px-3 py-3 transition-colors hover:bg-bone">
                      <V4Avatar name={signal.repName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-[13px] font-medium text-ink">{signal.repName}</p>
                          <V4Chip tone={signal.severity === 'critical' ? 'danger' : signal.severity === 'attention' ? 'warning' : 'success'}>
                            {signal.severity}
                          </V4Chip>
                        </div>
                        <p className="mt-0.5 text-[12px] text-graphite">{signal.reason}</p>
                      </div>
                      <ChevronRight className="size-3.5 shrink-0 self-center text-stone" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </V4Panel>
        </div>

        {/* Team workload + assigned work status */}
        <div className="lg:col-span-12">
          <V4Panel>
            <V4PanelHeader
              eyebrow="Team"
              title="Workload and assigned work"
              hint="Open work per person — context, not a performance score"
              action={
                <div className="flex flex-wrap items-center gap-1">
                  {(['all', 'replies', 'followups', 'priority', 'attention'] as TeamFilter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      aria-pressed={filter === f}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors',
                        filter === f ? 'bg-bone text-ink ring-1 ring-line' : 'text-stone hover:text-ink',
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              }
            />
            {filteredRows.length === 0 ? (
              <div className="mt-4">
                <V4Empty title="No people match this filter" body="Clear the filter to see the whole team." />
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                {filteredRows.map((row) => {
                  const max = Math.max(1, ...filteredRows.map((r) => r.repliesWaiting + r.followUpsOverdue + r.overdueTasks))
                  const load = row.repliesWaiting + row.followUpsOverdue + row.overdueTasks
                  return (
                    <li key={row.repId}>
                      <Link href={`/team/${row.repId}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bone">
                        <V4Avatar name={row.repName} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-[13px] font-medium text-ink">{row.repName}</p>
                            <p className="shrink-0 text-[11px] text-stone">
                              {row.activeProfile ?? 'No profile'}
                            </p>
                          </div>
                          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-bone" aria-hidden>
                            <div
                              className={cn('h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]', load > max * 0.7 ? 'bg-status-danger' : 'bg-orange')}
                              style={{ width: `${Math.round((load / max) * 100)}%` }}
                            />
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-graphite">
                            <span><span className="font-medium text-ink">{row.repliesWaiting}</span> replies</span>
                            <span><span className="font-medium text-ink">{row.followUpsOverdue}</span> follow-ups</span>
                            <span><span className="font-medium text-ink">{row.overdueTasks}</span> overdue tasks</span>
                            <span><span className="font-medium text-ink">{row.completedToday}</span> done</span>
                            <span><span className="font-medium text-ink">{row.targetPct}%</span> target</span>
                          </div>
                        </div>
                        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', severityClass(row.status))}>
                          {row.status}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link href="/tasks?scope=team" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                View team assigned work <ChevronRight className="size-3.5" aria-hidden />
              </Link>
              <span className="text-[11px] text-stone">· overdue assigned work is visible per person above</span>
            </div>
          </V4Panel>
        </div>

        {/* Recent activity */}
        <div className="lg:col-span-12">
          <V4Panel>
            <V4PanelHeader
              eyebrow="Activity"
              title="Recent important team events"
              action={
                <Link href="/team/activity" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
                  All activity <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {team.activity.length === 0 ? (
              <p className="mt-4 rounded-xl px-4 py-6 text-[13px] text-graphite ring-1 ring-line">
                No meaningful team events in the last few days.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
                {team.activity.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href ?? '#'} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-bone">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink">{item.label}</p>
                        <p className="text-[11px] text-stone">
                          <span>{new Date(item.occurredAt).toLocaleString('en-US', { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        </p>
                      </div>
                      {item.href && <ChevronRight className="size-3.5 shrink-0 text-stone" aria-hidden />}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </V4Panel>
        </div>
      </div>
    </div>
  )
}
