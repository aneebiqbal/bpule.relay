import Link from 'next/link'
import { cn } from 'cn'
import { ageLabel } from '@/components/operations/ops-primitives'
import { CONVERSATION_STATE_LABEL } from '@/lib/operations/conversations'
import { V4Avatar } from '@/components/v4/primitives'
import type { ChatPriority, ChatRow } from '@/lib/operations/chat-queue'

/**
 * Left pane. One compressed row per conversation: who, role · company, the
 * last message, the waiting state and who it belongs to. Rows are links to
 * `?lead=` so selection is URL state (refresh / back safe) — the row itself is
 * the open action, so there is no separate Reply button.
 */

const PRIORITY_LABEL: Record<ChatPriority, string> = { critical: 'Critical', high: 'High', normal: 'Normal', low: 'Low' }
const PRIORITY_CLASS: Record<ChatPriority, string> = {
  critical: 'text-status-danger',
  high: 'text-status-warning',
  normal: 'text-graphite',
  low: 'text-graphite',
}
const STATE_DOT: Record<ChatRow['state'], string> = {
  waiting_on_rep: 'bg-orange',
  waiting_on_prospect: 'bg-cobalt',
  follow_up_due: 'bg-status-warning',
  meeting: 'bg-status-success',
  closed: 'bg-stone/50',
}

export function ChatQueueList({
  rows,
  selectedLeadId,
  hrefFor,
  showOwner,
  emptyLabel,
  onSelect,
}: {
  rows: ChatRow[]
  selectedLeadId: string | null
  hrefFor: (leadId: string) => string
  showOwner: boolean
  emptyLabel: string
  /** When set, rows are buttons (fixtures, previews) instead of links. */
  onSelect?: (leadId: string) => void
}) {
  if (rows.length === 0) {
    return <p className="px-3 py-8 text-center text-[13px] text-graphite">{emptyLabel}</p>
  }
  return (
    <ul aria-label="Conversations" className="divide-y divide-line/70">
      {rows.map((row) => {
        const selected = row.leadId === selectedLeadId
        const waitingText =
          row.state === 'closed'
            ? 'Closed'
            : `${CONVERSATION_STATE_LABEL[row.state]}${row.ageHours !== null ? ` · ${ageLabel(row.ageHours)}` : ''}`
        const urgent = row.priority === 'critical' || row.priority === 'high'
        const content = (
          <>
            <div className="flex items-start gap-2.5">
              <V4Avatar name={row.person} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink">{row.person}</p>
                <p className="truncate text-[12px] text-graphite">
                  {[row.title, row.company].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              {urgent ? (
                <span className={cn('shrink-0 text-[11px] font-medium', PRIORITY_CLASS[row.priority])}>
                  <span className="sr-only">Priority: </span>
                  {PRIORITY_LABEL[row.priority]}
                </span>
              ) : null}
            </div>
            {row.preview && (
              <p className="mt-1.5 line-clamp-1 text-[12px] text-graphite">
                <span className="text-stone">{row.previewFrom === 'client' ? 'Them: ' : 'You: '}</span>
                {row.preview}
              </p>
            )}
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
              <span className={cn('inline-flex min-w-0 items-center gap-1.5', row.state === 'waiting_on_rep' ? 'font-medium text-ink' : 'text-graphite')}>
                <span className={cn('size-1.5 shrink-0 rounded-full', STATE_DOT[row.state])} aria-hidden="true" />
                <span className="truncate">{waitingText}</span>
              </span>
              <span className="shrink-0 truncate text-stone">
                {[row.profileName ?? 'No profile', showOwner ? row.ownerName : null].filter(Boolean).join(' · ')}
              </span>
            </div>
            {row.needsReview && <p className="mt-1 text-[11px] text-status-warning">Sender not verified — review thread</p>}
          </>
        )
        const className = cn(
          'block w-full px-3 py-2.5 text-left transition-colors focus-visible:bg-bone focus-visible:outline-none',
          selected
            ? 'bg-bone-raised shadow-[inset_2px_0_0_var(--color-orange)] ring-1 ring-orange/25'
            : 'hover:bg-bone-raised/70',
        )
        return (
          <li key={row.leadId}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(row.leadId)}
                aria-current={selected ? 'true' : undefined}
                className={className}
              >
                {content}
              </button>
            ) : (
              <Link href={hrefFor(row.leadId)} scroll={false} aria-current={selected ? 'true' : undefined} className={className}>
                {content}
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}
