'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import type { RepWorkspaceData } from '@/components/rep/rep-workspace'
import type { ManagerHomeTeamData } from '@/lib/team/manager-home-summary'
import { deriveTodayCounts } from '@/lib/relay/today-counts'
import {
  actionDeepLink,
  humanWhyNow,
  isHighPriorityOpportunity,
  primaryCtaLabel,
  rankActions,
  relativeWait,
} from '@/lib/rep-home/action-presentation'
import type { AttentionSeverity } from '@/lib/team/attention-policy'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

function severityClass(severity: AttentionSeverity | string) {
  if (severity === 'critical' || severity === 'Critical') {
    return 'bg-status-danger/10 text-status-danger'
  }
  if (severity === 'attention' || severity === 'Attention') {
    return 'bg-status-warning/10 text-status-warning'
  }
  return 'bg-status-success/10 text-status-success'
}

export function ManagerHomeView({
  personal,
  team,
  error,
}: {
  personal: RepWorkspaceData
  team: ManagerHomeTeamData
  error?: boolean
}) {
  const [tableFilter, setTableFilter] = useState<'all' | 'replies' | 'followups' | 'priority' | 'attention'>('all')

  const ranked = useMemo(() => rankActions(personal.allActions ?? []), [personal.allActions])
  const counts = useMemo(() => deriveTodayCounts(ranked), [ranked])
  const highPriority = useMemo(() => ranked.filter(isHighPriorityOpportunity), [ranked])
  const doNext = ranked.slice(0, 5)
  const completedToday = personal.targetSummary?.totalCompleted ?? 0

  const filteredRows = useMemo(() => {
    if (tableFilter === 'all') return team.rows
    if (tableFilter === 'attention') return team.rows.filter((r) => r.status !== 'On track')
    if (tableFilter === 'replies') return team.rows.filter((r) => r.repliesWaiting > 0)
    if (tableFilter === 'followups') return team.rows.filter((r) => r.followUpsOverdue > 0)
    if (tableFilter === 'priority') return team.rows.filter((r) => r.highPriority > 0)
    return team.rows
  }, [team.rows, tableFilter])

  return (
    <div className="space-y-8 pb-10">
      <header className="space-y-1">
        <h1 className="text-[28px] font-light tracking-[-0.02em] text-ink">
          Good {greeting()}, {personal.rep.name.split(' ')[0]}
        </h1>
        <p className="text-[14px] text-graphite">
          {team.teamName}
          {' · '}
          {team.memberCount} {team.memberCount === 1 ? 'person' : 'people'}
          {team.needsAttentionCount > 0
            ? ` · ${team.needsAttentionCount} need attention`
            : ' · on track'}
        </p>
        {personal.activeWorkspace && (
          <p className="text-[12px] text-stone">
            Working as{' '}
            <span className="font-medium text-ink">{personal.activeWorkspace.identityName}</span>
            <span className="text-stone"> · personal queue only</span>
          </p>
        )}
      </header>

      {error && (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-[12px] text-graphite">
          Could not load some team data. Personal work below is still available.
        </div>
      )}

      {/* 1. My work — personal, profile-scoped */}
      <section aria-label="My work" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[18px] font-medium text-ink">My work</h2>
          <Link href="/chats" className="text-[12px] font-medium text-cobalt hover:underline">
            View all my work →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Replies waiting" value={counts.repliesWaiting} hint="Your inbox" />
          <MetricCard label="Follow-ups due" value={counts.followUpsDue} hint="Your queue" />
          <MetricCard label="High-priority opportunities" value={highPriority.length} hint="Your book" />
          <MetricCard label="Completed today" value={completedToday} hint="Your targets" />
        </div>
        {doNext.length > 0 ? (
          <ol className="divide-y divide-line rounded-lg border border-line bg-bone-raised">
            {doNext.map((task, i) => (
              <li key={`${task.id}-${i}`} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-[11px] tabular-nums text-stone">{String(i + 1).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{task.title}</p>
                  <p className="truncate text-[12px] text-graphite">{humanWhyNow(task)}</p>
                  {task.createdAt && (
                    <p className="text-[11px] text-stone">{relativeWait(task.createdAt)}</p>
                  )}
                </div>
                <Link
                  href={actionDeepLink(task)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-solid px-2.5 py-1 text-[12px] font-medium text-on-solid"
                >
                  {primaryCtaLabel(task)}
                  <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-lg border border-line bg-bone-raised px-4 py-4 text-[13px] text-graphite">
            You&apos;re clear personally. Focus on the team below.
          </p>
        )}
      </section>

      {/* 2. Team attention */}
      <section aria-label="Needs attention" className="space-y-3">
        <h2 className="text-[18px] font-medium text-ink">Needs attention</h2>
        {team.attention.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-line bg-bone-raised px-6 py-8 text-center">
            <CheckCircle2 className="size-6 text-status-success" aria-hidden />
            <p className="mt-3 text-[15px] font-medium text-ink">Team is on track</p>
            <p className="mt-1 max-w-md text-[13px] text-graphite">
              No overdue replies, follow-ups or critical opportunities need attention.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/team" className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone">
                View team performance
              </Link>
              <Link href="/leads" className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone">
                Review pipeline
              </Link>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-bone-raised">
            {team.attention.map((signal) => (
              <li key={`${signal.repId}-${signal.category}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">{signal.repName}</p>
                  <p className="text-[12px] text-graphite">{signal.reason}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium capitalize', severityClass(signal.severity))}>
                    {signal.severity}
                  </span>
                  <Link
                    href={signal.href}
                    className="rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-ink hover:bg-bone"
                  >
                    {signal.category === 'REPLIES_WAITING'
                      ? 'Open queue'
                      : signal.category === 'FOLLOWUPS_OVERDUE'
                        ? 'View follow-ups'
                        : signal.category === 'HIGH_PRIORITY_UNTOUCHED'
                          ? 'Review opportunities'
                          : signal.category === 'TASKS_OVERDUE'
                            ? 'View tasks'
                            : 'Open'}
                  </Link>
                  {(signal.category === 'REPLIES_WAITING'
                    || signal.category === 'FOLLOWUPS_OVERDUE'
                    || signal.category === 'TASKS_OVERDUE'
                    || signal.category === 'HIGH_PRIORITY_UNTOUCHED') && (
                    <Link
                      href={`/tasks?assign=${signal.repId}`}
                      className="rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-ink hover:bg-bone"
                    >
                      Assign task
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3. Team operational metrics */}
      <section aria-label="Team metrics" className="space-y-3">
        <h2 className="text-[18px] font-medium text-ink">Team</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MetricCard
            label="Replies waiting"
            value={team.metrics.repliesWaiting}
            hint="Team scope"
            onClick={() => setTableFilter('replies')}
            active={tableFilter === 'replies'}
          />
          <MetricCard
            label="Overdue follow-ups"
            value={team.metrics.followUpsOverdue}
            hint="Team scope"
            onClick={() => setTableFilter('followups')}
            active={tableFilter === 'followups'}
          />
          <MetricCard
            label="High-priority"
            value={team.metrics.highPriority}
            hint="Team scope"
            onClick={() => setTableFilter('priority')}
            active={tableFilter === 'priority'}
          />
          <MetricCard label="Completed today" value={team.metrics.completedToday} hint="Team scope" />
          <MetricCard
            label="Meetings / Wins"
            value={team.metrics.meetings + team.metrics.wins}
            hint={`${team.metrics.meetings} meetings · ${team.metrics.wins} wins`}
          />
        </div>
        {tableFilter !== 'all' && (
          <button
            type="button"
            className="text-[12px] font-medium text-cobalt hover:underline"
            onClick={() => setTableFilter('all')}
          >
            Clear table filter
          </button>
        )}
      </section>

      {/* 4. Team table */}
      <section aria-label="Team table">
        <div className="overflow-x-auto rounded-lg border border-line bg-bone-raised">
          <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
            <thead className="sticky top-0 bg-bone-raised">
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-stone">
                <th className="px-3 py-2.5 font-medium">Rep</th>
                <th className="px-3 py-2.5 font-medium">Profile</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Done</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Replies</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Follow-ups</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Priority</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Overdue tasks</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Meetings</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Wins</th>
                <th className="px-3 py-2.5 font-medium tabular-nums">Target %</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-6 text-center text-graphite">
                    No people match this filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.repId} className="border-b border-line/70 last:border-0 hover:bg-bone">
                    <td className="px-3 py-2.5">
                      <Link href={`/team/${row.repId}`} className="font-medium text-ink hover:underline">
                        {row.repName}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-graphite">
                      <span className="block truncate max-w-[9rem]">
                        {row.activeProfile ?? '—'}
                      </span>
                      {row.channel && (
                        <span className="text-[11px] text-stone">{row.channel}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{row.completedToday}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/team/${row.repId}?focus=replies`} className="tabular-nums text-ink hover:underline">
                        {row.repliesWaiting}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/team/${row.repId}?focus=followups`} className="tabular-nums text-ink hover:underline">
                        {row.followUpsOverdue}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/team/${row.repId}?focus=priority`} className="tabular-nums text-ink hover:underline">
                        {row.highPriority}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/tasks?assignee=${row.repId}&view=overdue`} className="tabular-nums text-ink hover:underline">
                        {row.overdueTasks}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{row.meetings}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.wins}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.targetPct}%</td>
                    <td className="px-3 py-2.5">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', severityClass(row.status))}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/tasks?assign=${row.repId}`} className="text-[11px] font-medium text-cobalt hover:underline">
                          Assign
                        </Link>
                        <Link
                          href={`/tasks?assign=${row.repId}&kind=REQUEST_UPDATE`}
                          className="text-[11px] font-medium text-cobalt hover:underline"
                        >
                          Request update
                        </Link>
                        <Link href={`/tasks?assignee=${row.repId}`} className="text-[11px] font-medium text-cobalt hover:underline">
                          View tasks
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile compact list */}
        <ul className="mt-3 space-y-2 md:hidden">
          {filteredRows.map((row) => (
            <li key={`m-${row.repId}`} className="rounded-lg border border-line bg-bone-raised px-3 py-3">
              <Link href={`/team/${row.repId}`} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">{row.repName}</p>
                  <p className="text-[11px] text-graphite">
                    {row.repliesWaiting} replies · {row.followUpsOverdue} follow-ups · {row.targetPct}%
                  </p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', severityClass(row.status))}>
                  {row.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* 5. Recent important activity */}
      <section aria-label="Recent important activity" className="space-y-3">
        <h2 className="text-[18px] font-medium text-ink">Recent important activity</h2>
        {team.activity.length === 0 ? (
          <p className="text-[13px] text-graphite">No meaningful team events in the last few days.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-bone-raised">
            {team.activity.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">{item.label}</p>
                  <p className="text-[11px] text-stone">
                    {new Date(item.occurredAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                {item.href && (
                  <Link href={item.href} className="text-[12px] font-medium text-cobalt hover:underline">
                    Open
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function MetricCard({
  label,
  value,
  hint,
  onClick,
  active,
}: {
  label: string
  value: number
  hint: string
  onClick?: () => void
  active?: boolean
}) {
  const className = cn(
    'rounded-lg border bg-bone-raised px-3 py-3 text-left transition-colors',
    active ? 'border-orange/50 ring-1 ring-orange/20' : 'border-line',
    onClick && 'hover:border-orange/30',
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        <p className="text-[12px] text-graphite">{label}</p>
        <p className="mt-1 text-[26px] font-medium tabular-nums tracking-tight text-ink">{value}</p>
        <p className="mt-1 text-[11px] text-stone">{hint}</p>
      </button>
    )
  }
  return (
    <div className={className}>
      <p className="text-[12px] text-graphite">{label}</p>
      <p className="mt-1 text-[26px] font-medium tabular-nums tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-[11px] text-stone">{hint}</p>
    </div>
  )
}
