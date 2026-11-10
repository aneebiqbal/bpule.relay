'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable, type Column, type SortState } from '@/components/ui/data-table'
import { RepStatusBadge } from '@/components/operations/ops-primitives'
import { ChannelBadge } from '@/components/ui/channel-badge'
import { labelForAvailability, type AvailabilityState } from '@/lib/coverage/engine'
import type { PeopleRow } from '@/lib/operations/people'

const STATUS_RANK = { Critical: 0, Attention: 1, 'On track': 2 } as const

function sortRows(rows: PeopleRow[], sort: SortState | null): PeopleRow[] {
  if (!sort) return rows
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let cmp = 0
    switch (sort.key) {
      case 'person':
        cmp = a.repName.localeCompare(b.repName)
        break
      case 'status':
        cmp = STATUS_RANK[a.status] - STATUS_RANK[b.status]
        break
      default: {
        const key = sort.key as keyof PeopleRow
        cmp = Number(a[key] ?? 0) - Number(b[key] ?? 0)
      }
    }
    return cmp * dir || a.repName.localeCompare(b.repName)
  })
}

function CountLink({ value, href, label, warn }: { value: number; href: string; label: string; warn?: boolean }) {
  if (value === 0) return <span className="tabular-nums text-stone">0</span>
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      aria-label={`${value} ${label}`}
      className={warn ? 'font-medium tabular-nums text-[#b8531f] underline-offset-2 hover:underline' : 'tabular-nums text-ink underline-offset-2 hover:underline'}
    >
      {value}
    </Link>
  )
}

function todayLabel(row: PeopleRow): string {
  return row.totalTarget ? `${row.completedToday} / ${row.totalTarget}` : `${row.completedToday} done`
}

function availabilityLabelFor(state: AvailabilityState | null): string | null {
  return state ? labelForAvailability(state) : null
}

export function PeopleTable({ rows }: { rows: PeopleRow[] }) {
  const router = useRouter()
  const [sort, setSort] = useState<SortState | null>(null)
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort])

  const columns: Column<PeopleRow>[] = [
    {
      key: 'person',
      header: 'Person',
      render: (r) => (
        <div className="min-w-0">
          <Link href={`/team/${r.repId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:underline">
            {r.repName}
          </Link>
          <p className="mt-0.5 truncate text-[11px] text-stone">
            {[r.roleLabel, availabilityLabelFor(r.availability)].filter(Boolean).join(' · ')}
          </p>
        </div>
      ),
    },
    {
      key: 'today',
      header: 'Today',
      render: (r) => (
        <div>
          <span className="tabular-nums text-ink">{todayLabel(r)}</span>
          {r.totalTarget ? (
            <p className="mt-0.5 text-[11px] text-stone">{Math.max(0, r.totalTarget - r.completedToday)} remaining</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'profiles',
      header: 'Responsibilities',
      hideBelow: 'lg',
      render: (r) =>
        r.responsibilities.length > 0 ? (
          <span className="flex flex-col gap-1">
            {r.responsibilities.map((person) => (
              <span key={person.name} className="flex flex-wrap items-center gap-1">
                <span className="text-graphite">{person.name}</span>
                {person.channels.map((channel) => <ChannelBadge key={channel} channel={channel} />)}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-[#7d5410]">No profile</span>
        ),
    },
    {
      key: 'repliesWaiting',
      header: 'Replies',
      align: 'right',
      render: (r) => (
        <CountLink value={r.repliesWaiting} href={`/chats?rep=${r.repId}`} label="replies waiting" warn />
      ),
    },
    {
      key: 'followUpsOverdue',
      header: 'Follow-ups',
      align: 'right',
      render: (r) => (
        <CountLink value={r.followUpsOverdue} href={`/chats?rep=${r.repId}`} label="overdue follow-ups" warn />
      ),
    },
    {
      key: 'overdueTasks',
      header: 'Overdue',
      align: 'right',
      render: (r) => (
        <CountLink value={r.overdueTasks} href={`/team/${r.repId}?tab=work&view=overdue`} label="overdue tasks" warn />
      ),
    },
    {
      key: 'openLeads',
      header: 'Leads',
      align: 'right',
      hideBelow: 'md',
      render: (r) => <CountLink value={r.openLeads} href={`/team/${r.repId}?tab=leads`} label="open leads" />,
    },
    { key: 'status', header: 'Status', render: (r) => <RepStatusBadge status={r.status} /> },
  ]

  return (
    <DataTable
      columns={columns}
      rows={sorted}
      rowKey={(r) => r.repId}
      caption="Team members and the work in front of them today"
      sort={sort}
      onSortChange={setSort}
      onRowClick={(r) => router.push(`/team/${r.repId}`)}
      renderCard={(r) => (
        <div className="rounded-lg border border-line bg-bone-raised px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[14px] font-medium text-ink">{r.repName}</span>
            <RepStatusBadge status={r.status} />
          </div>
          <p className="mt-0.5 truncate text-[12px] text-graphite">
            {[r.roleLabel, availabilityLabelFor(r.availability)].filter(Boolean).join(' · ')}
          </p>
          {r.responsibilities.length > 0 && (
            <div className="mt-1 space-y-1">
              {r.responsibilities.map((person) => (
                <p key={person.name} className="flex flex-wrap items-center gap-1 text-[12px] text-graphite">
                  <span>{person.name}</span>
                  {person.channels.map((channel) => <ChannelBadge key={channel} channel={channel} />)}
                </p>
              ))}
            </div>
          )}
          <dl className="mt-2 grid grid-cols-4 gap-2 text-[12px]">
            <div>
              <dt className="text-stone">Today</dt>
              <dd className="tabular-nums text-ink">{todayLabel(r)}</dd>
            </div>
            <div>
              <dt className="text-stone">Replies</dt>
              <dd className="tabular-nums text-ink">{r.repliesWaiting}</dd>
            </div>
            <div>
              <dt className="text-stone">Follow-ups</dt>
              <dd className="tabular-nums text-ink">{r.followUpsOverdue}</dd>
            </div>
            <div>
              <dt className="text-stone">Overdue</dt>
              <dd className={`tabular-nums ${r.overdueTasks ? 'text-status-danger' : 'text-ink'}`}>{r.overdueTasks}</dd>
            </div>
          </dl>
          <div className="mt-2.5 flex gap-2">
            <Link
              href={`/team/${r.repId}`}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-graphite hover:text-ink"
            >
              Open
            </Link>
            <Link
              href={`/chats?rep=${r.repId}`}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-graphite hover:text-ink"
            >
              Replies
            </Link>
          </div>
        </div>
      )}
      empty={<p className="px-3 py-6 text-center text-[13px] text-graphite">No one matches these filters.</p>}
    />
  )
}
