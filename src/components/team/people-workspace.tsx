'use client'

/**
 * Team → People: actionable member cards, not a directory table.
 *
 * Each card shows the person's role, availability, assigned accounts with their
 * responsibility role, today's target progress, acknowledgements, overdue work
 * and workload, plus direct actions. Everything is read from the same People
 * directory contract as Manager Home, so the numbers never disagree.
 */
import { useState } from 'react'
import Link from 'next/link'
import { cn } from 'cn'
import { V4Empty } from '@/components/v4/primitives'
import { AssignTaskButton } from '@/components/operations/assign-task-button'
import { ChannelLogo } from '@/components/ui/channel-logo'
import { RepStatusBadge } from '@/components/operations/ops-primitives'
import { labelForAvailability } from '@/lib/coverage/engine'
import type { PeopleDirectory, PeopleRow } from '@/lib/operations/people'

const STATUS_RANK: Record<string, number> = { Critical: 0, Attention: 1, 'On track': 2 }

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '·'
}

function progress(row: PeopleRow): { completed: number; target: number } {
  return { completed: row.completedToday, target: row.totalTarget ?? 0 }
}

export function PeopleWorkspace({
  directory,
  businessDate,
  canAssign,
  reps,
}: {
  directory: PeopleDirectory
  businessDate: string
  canAssign: boolean
  reps: Array<{ id: string; name: string }>
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'attention' | 'on_track'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const rows = directory.rows
    .filter((row) => {
      if (filter === 'attention' && row.status === 'On track') return false
      if (filter === 'on_track' && row.status !== 'On track') return false
      const q = search.trim().toLowerCase()
      if (!q) return true
      return `${row.repName} ${row.responsibilities.map((r) => r.name).join(' ')} ${row.teams.map((t) => t.name).join(' ')}`.toLowerCase().includes(q)
    })
    .sort((a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) || a.repName.localeCompare(b.repName))

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Team / People</p>
          <h1 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">People</h1>
          <p className="mt-1 text-[13px] text-graphite">{businessDate} · {directory.rows.length} people · actionable assignments and targets.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people or accounts…"
            aria-label="Search people or accounts"
            className="h-9 w-56 rounded-lg border border-line bg-bone-raised px-3 text-[12px] text-ink placeholder:text-stone"
          />
          <div className="flex rounded-lg border border-line bg-bone-raised p-0.5">
            {(['all', 'attention', 'on_track'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
                className={cn('rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors', filter === option ? 'bg-bone text-ink shadow-sm' : 'text-graphite hover:text-ink')}
              >
                {option === 'all' ? 'All' : option === 'attention' ? 'Needs attention' : 'On track'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <V4Empty title="No one matches this view" body="Adjust the search or filter." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((row) => {
            const done = progress(row)
            return (
              <section key={row.repId} className="rounded-2xl bg-bone p-1.5 ring-1 ring-line">
                <div className="rounded-xl bg-bone-raised p-4 ring-1 ring-line/70">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bone text-[13px] font-medium text-ink ring-1 ring-line">
                        {initials(row.repName)}
                      </span>
                      <div className="min-w-0">
                        <Link href={`/team/${row.repId}`} className="truncate text-[15px] font-medium text-ink hover:underline">{row.repName}</Link>
                        <p className="mt-0.5 text-[11px] text-stone">
                          {row.roleLabel}
                          {row.availability ? ` · ${labelForAvailability(row.availability)}` : ''}
                          {row.teams.length > 0 ? ` · ${row.teams.map((t) => t.name).join(', ')}` : ''}
                        </p>
                      </div>
                    </div>
                    <RepStatusBadge status={row.status} />
                  </div>

                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-bone px-2 py-2 ring-1 ring-line/70">
                      <dt className="text-[10px] uppercase tracking-[0.12em] text-stone">Today</dt>
                      <dd className="mt-0.5 text-[13px] tabular-nums text-ink">{done.target ? `${done.completed} / ${done.target}` : `${done.completed}`}</dd>
                    </div>
                    <div className="rounded-lg bg-bone px-2 py-2 ring-1 ring-line/70">
                      <dt className="text-[10px] uppercase tracking-[0.12em] text-stone">Replies</dt>
                      <dd className={cn('mt-0.5 text-[13px] tabular-nums', row.repliesWaiting > 0 ? 'text-status-warning' : 'text-ink')}>{row.repliesWaiting}</dd>
                    </div>
                    <div className="rounded-lg bg-bone px-2 py-2 ring-1 ring-line/70">
                      <dt className="text-[10px] uppercase tracking-[0.12em] text-stone">Overdue</dt>
                      <dd className={cn('mt-0.5 text-[13px] tabular-nums', row.overdueTasks > 0 ? 'text-status-danger' : 'text-ink')}>{row.overdueTasks}</dd>
                    </div>
                  </dl>

                  <button
                    type="button"
                    onClick={() => toggle(row.repId)}
                    aria-expanded={expanded.has(row.repId)}
                    className="mt-3 w-full rounded-lg border border-line/70 px-2.5 py-1.5 text-left text-[11px] text-graphite hover:text-ink"
                  >
                    {expanded.has(row.repId) ? 'Hide assignments' : `Show ${row.responsibilities.length} assigned account${row.responsibilities.length === 1 ? '' : 's'}`}
                  </button>

                  {expanded.has(row.repId) && (
                    <div className="mt-2 space-y-2">
                      {row.responsibilities.length === 0 ? (
                        <p className="text-[12px] text-stone">No assignments yet.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {row.responsibilities.map((responsibility) => (
                            <li key={responsibility.name} className="rounded-lg bg-bone px-2.5 py-1.5 ring-1 ring-line/70">
                              <p className="truncate text-[12px] font-medium text-ink">{responsibility.name}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {responsibility.channels.map((channel) => (
                                  <span key={channel} className="inline-flex items-center gap-1 rounded-full bg-bone-raised px-1.5 py-0.5 text-[10px] text-graphite ring-1 ring-line">
                                    <ChannelLogo channel={channel} className="size-2.5" />
                                    {channel}
                                  </span>
                                ))}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <Link href={`/team/${row.repId}#responsibilities`} className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-graphite hover:text-ink">
                          Manage assignments
                        </Link>
                        <Link href={`/team/performance?rep=${row.repId}`} className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-graphite hover:text-ink">
                          Performance
                        </Link>
                        <Link href={`/workspace/${row.repId}`} className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-graphite hover:text-ink">
                          Open workspace
                        </Link>
                        {canAssign && <AssignTaskButton reps={reps} defaultAssigneeId={row.repId} />}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
