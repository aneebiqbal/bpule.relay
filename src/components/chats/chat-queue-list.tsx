import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { cn } from 'cn'
import { V4Avatar } from '@/components/v4/primitives'
import { attentionShort } from '@/lib/operations/conversations'
import { sourceLabel } from '@/lib/operations/filters'
import type { ChatPriority, ChatRow } from '@/lib/operations/chat-queue'

/**
 * Left pane. One understandable row per conversation: who, role · company,
 * source · profile, the canonical reason it needs attention, the last message
 * and a compact priority mark. Rows are links to `?lead=` so selection is URL
 * state (refresh / back safe) — the row itself is the open action.
 */

const PRIORITY_LABEL: Record<ChatPriority, string> = { critical: 'Critical', high: 'High', normal: 'Normal', low: 'Low' }
const PRIORITY_CLASS: Record<ChatPriority, string> = {
  critical: 'text-status-danger',
  high: 'text-status-warning',
  normal: 'text-graphite',
  low: 'text-graphite',
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
            <p className="mt-1.5 truncate text-[11px] text-stone">
              {sourceLabel(row.sourceRaw)}
              {row.profileName ? ` · ${row.profileName}` : ''}
              {showOwner && row.ownerName ? ` · ${row.ownerName}` : ''}
            </p>
            <p className={cn('mt-0.5 text-[12px]', row.state === 'waiting_on_rep' ? 'font-medium text-ink' : 'text-graphite')}>
              {attentionShort(row)}
            </p>
            {row.preview && (
              <p className="mt-1 line-clamp-1 text-[12px] text-graphite">
                <span className="text-stone">{row.previewFrom === 'client' ? 'Them: ' : 'You: '}</span>
                {row.preview}
              </p>
            )}
            {row.needsReview && (
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-status-warning">
                <AlertTriangle className="size-3" aria-hidden="true" />
                Sender not verified
              </p>
            )}
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
