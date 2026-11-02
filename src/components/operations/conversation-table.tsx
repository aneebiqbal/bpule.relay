'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DataTable, type Column } from '@/components/ui/data-table'
import { StatusBadge } from '@/components/ui/status-badge'
import { ageLabel, relativeTime } from '@/components/operations/ops-primitives'
import {
  CONVERSATION_STATE_LABEL,
  type ConversationRow,
  type ConversationState,
} from '@/lib/operations/conversations'

const STATE_VARIANT: Record<ConversationState, 'orange' | 'cobalt' | 'warning' | 'success' | 'neutral'> = {
  waiting_on_rep: 'orange',
  follow_up_due: 'warning',
  meeting: 'success',
  waiting_on_prospect: 'cobalt',
  closed: 'neutral',
}

/** Conversation oversight table. Opening a row opens the canonical thread. */
export function ConversationTable({
  rows,
  now,
  showOwner = false,
}: {
  rows: ConversationRow[]
  now: number
  showOwner?: boolean
}) {
  const router = useRouter()
  const columns: Column<ConversationRow>[] = [
    {
      key: 'person',
      header: 'Person',
      render: (r) => (
        <Link href={r.href} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:underline">
          {r.person}
        </Link>
      ),
    },
    {
      key: 'company',
      header: 'Company',
      hideBelow: 'md',
      render: (r) =>
        r.companyKey ? (
          <Link
            href={`/accounts/${encodeURIComponent(r.companyKey)}`}
            onClick={(e) => e.stopPropagation()}
            className="text-graphite hover:underline"
          >
            {r.company ?? r.companyKey}
          </Link>
        ) : (
          <span className="text-graphite">{r.company ?? '—'}</span>
        ),
    },
    ...(showOwner
      ? [{ key: 'owner', header: 'Rep', hideBelow: 'lg' as const, render: (r: ConversationRow) => <span className="text-graphite">{r.ownerName ?? '—'}</span> }]
      : []),
    {
      key: 'profile',
      header: 'Profile',
      hideBelow: 'lg',
      render: (r) => <span className="text-graphite">{r.profileName ?? <span className="text-status-warning">Not assigned</span>}</span>,
    },
    {
      key: 'state',
      header: 'State',
      render: (r) => <StatusBadge status={CONVERSATION_STATE_LABEL[r.state]} variant={STATE_VARIANT[r.state]} />,
    },
    {
      key: 'lastInbound',
      header: 'Last inbound',
      hideBelow: 'xl',
      render: (r) => <span className="tabular-nums text-graphite">{relativeTime(r.lastInboundAt, now)}</span>,
    },
    {
      key: 'lastOutbound',
      header: 'Last outbound',
      hideBelow: 'xl',
      render: (r) => <span className="tabular-nums text-graphite">{relativeTime(r.lastOutboundAt, now)}</span>,
    },
    { key: 'waitingOn', header: 'Waiting on', hideBelow: 'md', render: (r) => <span className="text-graphite">{r.waitingOn ?? '—'}</span> },
    {
      key: 'age',
      header: 'Age',
      align: 'right',
      render: (r) => (
        <span className={r.state === 'waiting_on_rep' && (r.ageHours ?? 0) >= 12 ? 'font-medium tabular-nums text-status-danger' : 'tabular-nums text-ink'}>
          {ageLabel(r.ageHours)}
        </span>
      ),
    },
    { key: 'next', header: 'Next action', hideBelow: 'sm', render: (r) => <span className="text-ink">{r.nextAction}</span> },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.leadId}
      caption="Conversations, waiting on rep first"
      onRowClick={(r) => router.push(r.href)}
      renderCard={(r) => (
        <Link href={r.href} className="block rounded-lg border border-line bg-bone-raised px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[14px] font-medium text-ink">{r.person}</span>
            <StatusBadge status={CONVERSATION_STATE_LABEL[r.state]} variant={STATE_VARIANT[r.state]} />
          </div>
          <p className="mt-0.5 truncate text-[12px] text-graphite">
            {[r.company, showOwner ? r.ownerName : null, r.profileName].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-1 text-[12px] text-ink">
            {r.nextAction}
            {r.ageHours !== null && <span className="text-stone"> · {ageLabel(r.ageHours)}</span>}
          </p>
        </Link>
      )}
      empty={<p className="px-3 py-6 text-center text-[13px] text-graphite">No conversations in this view.</p>}
    />
  )
}
