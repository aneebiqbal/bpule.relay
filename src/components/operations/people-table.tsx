'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable, type Column, type SortState } from '@/components/ui/data-table'
import { RepStatusBadge } from '@/components/operations/ops-primitives'
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
      className={warn ? 'font-medium tabular-nums text-orange underline-offset-2 hover:underline' : 'tabular-nums text-ink underline-offset-2 hover:underline'}
    >
      {value}
    </Link>
  )
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
        <Link href={`/team/${r.repId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:underline">
          {r.repName}
        </Link>
      ),
    },
    { key: 'role', header: 'Role', render: (r) => <span className="text-graphite">{r.roleLabel}</span>, hideBelow: 'lg' },
    {
      key: 'team',
      header: 'Team',
      hideBelow: 'lg',
      render: (r) =>
        r.teams.length === 0 ? (
          <span className="text-stone">—</span>
        ) : (
          <span className="flex flex-wrap gap-x-2">
            {r.teams.map((t) => (
              <Link key={t.id} href={`/team/groups/${t.id}`} onClick={(e) => e.stopPropagation()} className="text-graphite hover:underline">
                {t.name}
              </Link>
            ))}
          </span>
        ),
    },
    {
      key: 'profile',
      header: 'Active profile',
      hideBelow: 'xl',
      render: (r) =>
        r.activeProfile ? (
          <span className="truncate text-graphite">{r.activeProfile}</span>
        ) : (
          <span className="text-status-warning">No profile</span>
        ),
    },
    {
      key: 'openLeads',
      header: 'Open leads',
      align: 'right',
      render: (r) => <CountLink value={r.openLeads} href={`/team/${r.repId}?tab=leads`} label="open leads" />,
    },
    {
      key: 'repliesWaiting',
      header: 'Replies waiting',
      align: 'right',
      render: (r) => (
        <CountLink value={r.repliesWaiting} href={`/chats?rep=${r.repId}`} label="replies waiting" warn />
      ),
    },
    {
      key: 'overdueTasks',
      header: 'Overdue tasks',
      align: 'right',
      render: (r) => (
        <CountLink value={r.overdueTasks} href={`/team/${r.repId}?tab=work&view=overdue`} label="overdue tasks" warn />
      ),
    },
    {
      key: 'meetings',
      header: 'Meetings',
      align: 'right',
      hideBelow: 'md',
      render: (r) => <span className="tabular-nums">{r.meetings}</span>,
    },
    { key: 'wins', header: 'Wins', align: 'right', hideBelow: 'md', render: (r) => <span className="tabular-nums">{r.wins}</span> },
    {
      key: 'targetPct',
      header: 'Target',
      align: 'right',
      hideBelow: 'sm',
      render: (r) => <span className="tabular-nums">{Math.round(r.targetPct)}%</span>,
    },
    { key: 'status', header: 'Status', render: (r) => <RepStatusBadge status={r.status} /> },
  ]

  return (
    <DataTable
      columns={columns}
      rows={sorted}
      rowKey={(r) => r.repId}
      caption="Team members and their current workload"
      sort={sort}
      onSortChange={setSort}
      onRowClick={(r) => router.push(`/team/${r.repId}`)}
      renderCard={(r) => (
        <Link href={`/team/${r.repId}`} className="block rounded-lg border border-line bg-bone-raised px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[14px] font-medium text-ink">{r.repName}</span>
            <RepStatusBadge status={r.status} />
          </div>
          <p className="mt-0.5 truncate text-[12px] text-graphite">
            {[r.roleLabel, r.teams.map((t) => t.name).join(', '), r.activeProfile].filter(Boolean).join(' · ')}
          </p>
          <dl className="mt-2 grid grid-cols-4 gap-2 text-[12px]">
            <div><dt className="text-stone">Leads</dt><dd className="tabular-nums text-ink">{r.openLeads}</dd></div>
            <div><dt className="text-stone">Replies</dt><dd className="tabular-nums text-ink">{r.repliesWaiting}</dd></div>
            <div><dt className="text-stone">Overdue</dt><dd className="tabular-nums text-ink">{r.overdueTasks}</dd></div>
            <div><dt className="text-stone">Target</dt><dd className="tabular-nums text-ink">{Math.round(r.targetPct)}%</dd></div>
          </dl>
        </Link>
      )}
      empty={<p className="px-3 py-6 text-center text-[13px] text-graphite">No one matches these filters.</p>}
    />
  )
}
