'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DataTable, type Column } from '@/components/ui/data-table'
import { StatusBadge } from '@/components/ui/status-badge'
import { relativeTime } from '@/components/operations/ops-primitives'
import type { AccountRow } from '@/lib/operations/accounts'

const REL_VARIANT: Record<AccountRow['relationship'], 'neutral' | 'cobalt' | 'orange' | 'success' | 'info'> = {
  lead: 'neutral',
  contact: 'cobalt',
  reply: 'orange',
  meeting: 'info',
  proposal: 'info',
  won: 'success',
}

export function accountHref(companyKey: string): string {
  return `/accounts/${encodeURIComponent(companyKey)}`
}

export function AccountsTable({ rows, now }: { rows: AccountRow[]; now: number }) {
  const router = useRouter()
  const columns: Column<AccountRow>[] = [
    {
      key: 'company',
      header: 'Company',
      render: (r) => (
        <Link href={accountHref(r.companyKey)} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:underline">
          {r.company}
        </Link>
      ),
    },
    { key: 'region', header: 'Region', hideBelow: 'xl', render: (r) => <span className="text-graphite">{r.region ?? '—'}</span> },
    { key: 'people', header: 'People', align: 'right', render: (r) => <span className="tabular-nums">{r.people}</span> },
    {
      key: 'active',
      header: 'Active opps',
      align: 'right',
      render: (r) => <span className="tabular-nums">{r.activeOpportunities}</span>,
    },
    {
      key: 'profiles',
      header: 'Profiles',
      hideBelow: 'lg',
      render: (r) =>
        r.profiles.length ? <span className="text-graphite">{r.profiles.join(', ')}</span> : <span className="text-status-warning">None</span>,
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (r) => <StatusBadge status={r.relationshipLabel} variant={REL_VARIANT[r.relationship]} />,
    },
    {
      key: 'last',
      header: 'Last activity',
      hideBelow: 'md',
      render: (r) => <span className="tabular-nums text-graphite">{relativeTime(r.lastActivityAt, now)}</span>,
    },
    {
      key: 'next',
      header: 'Next action',
      hideBelow: 'sm',
      render: (r) =>
        r.nextActionHref ? (
          <Link href={r.nextActionHref} onClick={(e) => e.stopPropagation()} className="text-ink hover:underline">
            {r.nextAction}
          </Link>
        ) : (
          <span className="text-graphite">{r.nextAction}</span>
        ),
    },
    { key: 'owner', header: 'Owner', hideBelow: 'lg', render: (r) => <span className="text-graphite">{r.owners.join(', ') || '—'}</span> },
  ]
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.companyKey}
      caption="Accounts, most recent activity first"
      onRowClick={(r) => router.push(accountHref(r.companyKey))}
      renderCard={(r) => (
        <Link href={accountHref(r.companyKey)} className="block rounded-lg border border-line bg-bone-raised px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[14px] font-medium text-ink">{r.company}</span>
            <StatusBadge status={r.relationshipLabel} variant={REL_VARIANT[r.relationship]} />
          </div>
          <p className="mt-0.5 text-[12px] text-graphite">
            {r.people} people · {r.activeOpportunities} active · {relativeTime(r.lastActivityAt, now)}
          </p>
          <p className="mt-1 truncate text-[12px] text-ink">{r.nextAction}</p>
        </Link>
      )}
      empty={<p className="px-3 py-6 text-center text-[13px] text-graphite">No accounts match these filters.</p>}
    />
  )
}
