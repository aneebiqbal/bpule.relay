'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronRight, MoreHorizontal } from 'lucide-react'
import { cn } from 'cn'
import type { RepWorkspaceData } from '@/components/rep/rep-workspace'
import type { RelayTodayAction } from '@/components/relay-today-workspace'
import { deriveTodayCounts } from '@/lib/relay/today-counts'
import {
  actionDeepLink,
  classifyWorkTab,
  humanWhyNow,
  isHighPriorityOpportunity,
  overdueSeverity,
  primaryCtaLabel,
  rankActions,
  relativeWait,
  taskCategoryLabel,
  type RepWorkTab,
} from '@/lib/rep-home/action-presentation'
import { TODAY_FOLLOWUP_KINDS, TODAY_REPLY_KINDS } from '@/lib/relay/today-counts'
import { rankUnifiedTasks, classifyUnifiedTaskTab } from '@/lib/tasks/rank-unified-tasks'
import type { UnifiedTask } from '@/lib/tasks/types'

type MetricKey = 'replies' | 'followups' | 'priority' | 'completed'

const WORK_TABS: Array<{ id: RepWorkTab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
]

export function RepHomeView({ data }: { data: RepWorkspaceData }) {
  const queueRef = useRef<HTMLDivElement>(null)
  const workRef = useRef<HTMLDivElement>(null)
  const [workTab, setWorkTab] = useState<RepWorkTab>('today')
  const [metricFocus, setMetricFocus] = useState<MetricKey | null>(null)

  const ranked = useMemo(() => rankActions(data.allActions ?? []), [data.allActions])
  const unified = useMemo(
    () => rankUnifiedTasks(data.unifiedTasks ?? []),
    [data.unifiedTasks],
  )
  const counts = useMemo(() => deriveTodayCounts(ranked), [ranked])
  const highPriority = useMemo(() => ranked.filter(isHighPriorityOpportunity), [ranked])

  const totalTarget = data.targetSummary?.totalTarget ?? 0
  const totalCompleted = data.targetSummary?.totalCompleted ?? 0

  const repliesOld4h = ranked.filter((a) =>
    (TODAY_REPLY_KINDS as readonly string[]).includes(a.kind)
    && overdueSeverity(a.createdAt) !== 'none'
    && overdueSeverity(a.createdAt) !== 'mild',
  ).length

  const followupsOverdue = ranked.filter((a) =>
    (TODAY_FOLLOWUP_KINDS as readonly string[]).includes(a.kind)
    && overdueSeverity(a.createdAt) !== 'none',
  ).length

  const doNext = unified.length > 0 ? unified.slice(0, 12) : ranked.slice(0, 12)
  const caughtUp = (unified.length > 0 ? unified : ranked).length === 0

  const workRows = useMemo(() => {
    if (workTab === 'completed') return []
    if (unified.length > 0) {
      return unified.filter((t) => classifyUnifiedTaskTab(t) === workTab)
    }
    return ranked.filter((a) => classifyWorkTab(a) === workTab)
  }, [ranked, unified, workTab])

  const completedRows = useMemo(() => {
    const rows: Array<{ label: string; count: number }> = []
    for (const identity of data.targetSummary?.byIdentity ?? []) {
      for (const t of identity.targets) {
        if (t.completedCount <= 0) continue
        rows.push({ label: t.activityType, count: t.completedCount })
      }
    }
    return rows
  }, [data.targetSummary?.byIdentity])

  const scoreboard = useMemo(() => aggregateScoreboard(data), [data])

  function scrollToQueue(key: MetricKey) {
    setMetricFocus(key)
    setWorkTab(key === 'completed' ? 'completed' : key === 'priority' ? 'today' : key === 'replies' || key === 'followups' ? 'today' : 'today')
    queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    workRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const useUnified = unified.length > 0

  const filteredDoNext = useMemo(() => {
    if (!metricFocus || metricFocus === 'completed') return doNext
    if (useUnified) {
      const tasks = doNext as UnifiedTask[]
      if (metricFocus === 'replies') return tasks.filter((t) => t.kind === 'REPLY')
      if (metricFocus === 'followups') return tasks.filter((t) => t.kind === 'FOLLOW_UP')
      if (metricFocus === 'priority') {
        return tasks.filter((t) => t.priority === 'HIGH' || t.priority === 'CRITICAL')
      }
      return tasks
    }
    const actions = doNext as RelayTodayAction[]
    if (metricFocus === 'replies') {
      return actions.filter((a) => (TODAY_REPLY_KINDS as readonly string[]).includes(a.kind))
    }
    if (metricFocus === 'followups') {
      return actions.filter((a) => (TODAY_FOLLOWUP_KINDS as readonly string[]).includes(a.kind))
    }
    if (metricFocus === 'priority') return actions.filter(isHighPriorityOpportunity)
    return actions
  }, [doNext, metricFocus, useUnified])

  return (
    <div className="space-y-8 pb-10">
      <header className="space-y-1">
        <h1 className="text-[28px] font-light tracking-[-0.02em] text-ink">
          Good {greeting()}, {data.rep.name.split(' ')[0]}
        </h1>
        <p className="text-[14px] text-graphite">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        {data.activeWorkspace && (
          <p className="text-[12px] text-stone">
            Working as{' '}
            <span className="font-medium text-ink">{data.activeWorkspace.identityName}</span>
            {data.activeWorkspace.channel ? ` · ${data.activeWorkspace.channel.toUpperCase()}` : ''}
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Operational metrics">
        <MetricCard
          label="Replies waiting"
          value={counts.repliesWaiting}
          hint={
            counts.repliesWaiting === 0
              ? 'Inbox clear'
              : repliesOld4h > 0
                ? `${repliesOld4h} older than 4h`
                : 'Answer while fresh'
          }
          active={metricFocus === 'replies'}
          onClick={() => scrollToQueue('replies')}
        />
        <MetricCard
          label="Follow-ups due"
          value={counts.followUpsDue}
          hint={
            counts.followUpsDue === 0
              ? 'Nothing due'
              : followupsOverdue > 0
                ? `${followupsOverdue} overdue`
                : 'Due today'
          }
          active={metricFocus === 'followups'}
          onClick={() => scrollToQueue('followups')}
        />
        <MetricCard
          label="High-priority opportunities"
          value={highPriority.length}
          hint={highPriority.length > 0 ? 'Worth acting on' : 'None queued'}
          active={metricFocus === 'priority'}
          onClick={() => scrollToQueue('priority')}
        />
        <MetricCard
          label="Completed today"
          value={totalCompleted}
          hint={totalTarget > 0 ? `of ${totalTarget} target` : 'Logged actions'}
          active={metricFocus === 'completed'}
          onClick={() => scrollToQueue('completed')}
        />
      </section>

      <section ref={queueRef} aria-label="Do this next">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <div>
            <h2 className="text-[18px] font-medium text-ink">Do this next</h2>
            <p className="text-[13px] text-graphite">Ranked by urgency — one action per row</p>
          </div>
        </div>

        {filteredDoNext.length > 0 ? (
          <ol className="divide-y divide-line rounded-lg border border-line bg-bone-raised">
            {filteredDoNext.map((task, i) =>
              useUnified ? (
                <UnifiedDoNextRow key={`${task.id}-${i}`} rank={i + 1} task={task as UnifiedTask} />
              ) : (
                <DoNextRow key={`${task.id}-${i}`} rank={i + 1} task={task as RelayTodayAction} />
              ),
            )}
          </ol>
        ) : caughtUp ? (
          <EmptyCaughtUp />
        ) : (
          <p className="rounded-lg border border-line bg-bone-raised px-4 py-6 text-[13px] text-graphite">
            No tasks in this filter. Clear the metric filter or switch profile.
          </p>
        )}
      </section>

      <section ref={workRef} aria-label="My work">
        <h2 className="text-[18px] font-medium text-ink">My work</h2>
        <div className="mt-3 flex flex-wrap gap-1 border-b border-line" role="tablist">
          {WORK_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={workTab === tab.id}
              className={cn(
                'rounded-t-md px-3 py-2 text-[13px] font-medium transition-colors',
                workTab === tab.id
                  ? 'border border-b-0 border-line bg-bone-raised text-ink'
                  : 'text-graphite hover:text-ink',
              )}
              onClick={() => setWorkTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="rounded-b-lg rounded-tr-lg border border-line bg-bone-raised" role="tabpanel">
          {workTab === 'completed' ? (
            completedRows.length > 0 ? (
              <ul className="divide-y divide-line/70">
                {completedRows.map((row) => (
                  <li key={row.label} className="flex items-center justify-between px-4 py-3 text-[13px]">
                    <span className="text-ink">{row.label}</span>
                    <span className="tabular-nums text-graphite">{row.count} today</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-[13px] text-graphite">No completed actions logged for this profile yet today.</p>
            )
          ) : workRows.length > 0 ? (
            <ul className="divide-y divide-line/70">
              {workRows.map((task, i) =>
                useUnified ? (
                  <UnifiedWorkRow key={`${task.id}-work-${i}`} task={task as UnifiedTask} />
                ) : (
                  <WorkRow key={`${task.id}-work-${i}`} task={task as RelayTodayAction} />
                ),
              )}
            </ul>
          ) : (
            <p className="px-4 py-6 text-[13px] text-graphite">Nothing in this tab for your current profile.</p>
          )}
        </div>
      </section>

      <section aria-label="Personal scoreboard" className="rounded-lg border border-line bg-bone-raised px-4 py-4">
        <h2 className="text-[16px] font-medium text-ink">Personal scoreboard</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <ScoreStat label="Connections sent" value={scoreboard.connections} />
          <ScoreStat label="Replies" value={scoreboard.replies} />
          <ScoreStat label="Meetings" value={scoreboard.meetings} />
          <ScoreStat label="Proposals" value={scoreboard.proposals} />
          <ScoreStat label="Wins" value={scoreboard.wins} />
          <ScoreStat label="Weekly target" value={totalTarget > 0 ? `${totalCompleted} / ${totalTarget}` : '—'} sub={totalTarget > 0 ? `${Math.round((totalCompleted / totalTarget) * 100)}%` : undefined} />
        </div>
      </section>
    </div>
  )
}

function MetricCard({
  label,
  value,
  hint,
  active,
  onClick,
}: {
  label: string
  value: number
  hint: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border bg-bone-raised px-3 py-3 text-left transition-colors hover:border-orange/30',
        active ? 'border-orange/50 ring-1 ring-orange/20' : 'border-line',
      )}
    >
      <p className="text-[12px] text-graphite">{label}</p>
      <p className="mt-1 text-[26px] font-medium tabular-nums tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-[11px] text-stone">{hint}</p>
    </button>
  )
}

function UnifiedDoNextRow({ rank, task }: { rank: number; task: UnifiedTask }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <span className="text-mono-medium text-[11px] text-stone">{String(rank).padStart(2, '0')}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-ink">{task.title}</p>
        {task.companyName && <p className="truncate text-[12px] text-graphite">{task.companyName}</p>}
        <p className="mt-1 text-[12px] text-graphite">{task.reason}</p>
        {(task.dueAt || task.createdAt) && (
          <p className="text-[11px] text-stone">{relativeWait(task.dueAt ?? task.createdAt)}</p>
        )}
        {task.profileName && (
          <p className="mt-1 text-[11px] text-stone">
            Profile: <span className="text-ink">{task.profileName}</span>
          </p>
        )}
      </div>
      <Link
        href={task.action.href}
        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid"
      >
        {task.action.label}
        <ChevronRight className="size-3.5" aria-hidden />
      </Link>
    </li>
  )
}

function UnifiedWorkRow({ task }: { task: UnifiedTask }) {
  return (
    <li className="grid grid-cols-1 items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-stone">{task.kind.replace('_', ' ')}</p>
        <p className="truncate text-[13px] font-medium text-ink">{task.title}</p>
        <p className="truncate text-[12px] text-graphite">{task.reason}</p>
        <p className="mt-1 text-[11px] text-stone">
          {task.profileName ?? '—'}
          {' · '}
          {task.source === 'ASSIGNED' ? 'Assigned' : 'Derived'}
          {' · '}
          {task.priority}
        </p>
      </div>
      <Link href={task.action.href} className="rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-ink hover:bg-bone">
        {task.action.label}
      </Link>
    </li>
  )
}

function DoNextRow({ rank, task }: { rank: number; task: RelayTodayAction }) {
  const href = actionDeepLink(task)
  const severity = overdueSeverity(task.createdAt)
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <span className="text-mono-medium text-[11px] text-stone">{String(rank).padStart(2, '0')}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-ink">{task.title}</p>
        {task.subtitle && <p className="truncate text-[12px] text-graphite">{task.subtitle}</p>}
        <p className="mt-1 text-[12px] text-graphite">{humanWhyNow(task)}</p>
        {task.createdAt && (
          <p className="text-[11px] text-stone">{relativeWait(task.createdAt)}</p>
        )}
        {task.identity?.name && (
          <p className="mt-1 text-[11px] text-stone">
            Profile: <span className="text-ink">{task.identity.name}</span>
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {severity !== 'none' && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              severity === 'critical' && 'bg-status-danger/10 text-status-danger',
              severity === 'attention' && 'bg-status-warning/10 text-status-warning',
              severity === 'mild' && 'bg-bone text-graphite',
            )}
          >
            {severity === 'critical' ? 'Critical' : severity === 'attention' ? 'Attention' : 'Due'}
          </span>
        )}
        <Link
          href={href}
          className="inline-flex items-center gap-1 rounded-md bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid"
        >
          {primaryCtaLabel(task)}
          <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </li>
  )
}

function WorkRow({ task }: { task: RelayTodayAction }) {
  const href = actionDeepLink(task)
  const severity = overdueSeverity(task.createdAt)
  return (
    <li className="grid grid-cols-1 items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-stone">{taskCategoryLabel(task)}</p>
        <p className="truncate text-[13px] font-medium text-ink">{task.title}</p>
        <p className="truncate text-[12px] text-graphite">{task.subtitle || humanWhyNow(task)}</p>
        <p className="mt-1 text-[11px] text-stone">
          {task.identity?.name ?? '—'}
          {' · '}
          {task.priority === 'urgent' ? 'Due now' : task.priority === 'high' ? 'Due today' : 'Upcoming'}
          {' · '}
          <span className="capitalize">{task.priority}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        {severity !== 'none' && (
          <span className="text-[10px] text-status-warning">Overdue</span>
        )}
        <Link href={href} className="rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-ink hover:bg-bone">
          {primaryCtaLabel(task)}
        </Link>
        <button type="button" className="rounded p-1 text-stone hover:bg-bone" aria-label="More actions">
          <MoreHorizontal className="size-4" />
        </button>
      </div>
    </li>
  )
}

function EmptyCaughtUp() {
  return (
    <div className="flex flex-col items-center rounded-lg border border-line bg-bone-raised px-6 py-10 text-center">
      <CheckCircle2 className="size-6 text-status-success" aria-hidden />
      <p className="mt-3 text-[15px] font-medium text-ink">You&apos;re caught up.</p>
      <p className="mt-1 max-w-md text-[13px] text-graphite">
        No replies, overdue follow-ups or high-priority opportunities need attention right now.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link href="/prospect" className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone">
          Analyze a prospect
        </Link>
        <Link href="/archive" className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone">
          Review watchlist
        </Link>
        <Link href="/upwork" className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone">
          Open Upwork
        </Link>
      </div>
    </div>
  )
}

function ScoreStat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div>
      <p className="text-[11px] text-stone">{label}</p>
      <p className="mt-0.5 text-[16px] font-medium tabular-nums text-ink">{value}</p>
      {sub && <p className="text-[10px] text-graphite">{sub}</p>}
    </div>
  )
}

function aggregateScoreboard(data: RepWorkspaceData) {
  const totals = { connections: 0, replies: 0, meetings: 0, proposals: 0, wins: 0 }
  for (const identity of data.targetSummary?.byIdentity ?? []) {
    for (const t of identity.targets) {
      const key = t.activityType.toLowerCase()
      if (key.includes('connection')) totals.connections += t.completedCount
      else if (key.includes('reply')) totals.replies += t.completedCount
      else if (key.includes('meeting')) totals.meetings += t.completedCount
      else if (key.includes('proposal')) totals.proposals += t.completedCount
      else if (key.includes('win')) totals.wins += t.completedCount
    }
  }
  return totals
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
