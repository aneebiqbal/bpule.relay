import Link from 'next/link'
import { cn } from 'cn'
import { ageLabel } from '@/components/operations/ops-primitives'
import { CONVERSATION_STATE_LABEL } from '@/lib/operations/conversations'
import type { ChatPriority, ChatRow } from '@/lib/operations/chat-queue'

const PRIORITY_LABEL: Record<ChatPriority, string> = { critical: 'Critical', high: 'High', normal: 'Normal', low: 'Low' }
const PRIORITY_CLASS: Record<ChatPriority, string> = {
  critical: 'text-[#8f2b1e]',
  high: 'text-[#9e4517]',
  normal: 'text-graphite',
  low: 'text-graphite',
}

/**
 * Left pane. Compact rows (no cards): person, title · company, profile,
 * preview, waiting state + age, priority and next action. Each row is a link
 * to `?lead=` so the selection is URL state (refresh / back safe).
 */
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
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13px] font-medium text-ink">{row.person}</span>
              <span className={cn('shrink-0 text-[11px] font-medium', PRIORITY_CLASS[row.priority])}>
                <span className="sr-only">Priority: </span>
                {PRIORITY_LABEL[row.priority]}
              </span>
            </div>
            <p className="truncate text-[12px] text-graphite">
              {[row.title, row.company].filter(Boolean).join(' · ') || '—'}
            </p>
            <p className="truncate text-[11px] text-graphite">
              {[row.profileName ?? 'No profile', showOwner ? row.ownerName : null].filter(Boolean).join(' · ')}
            </p>
            {row.preview && (
              <p className="mt-0.5 line-clamp-1 text-[12px] text-graphite">
                <span className="text-graphite">{row.previewFrom === 'client' ? 'Them: ' : 'You: '}</span>
                {row.preview}
              </p>
            )}
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px]">
              <span className={row.state === 'waiting_on_rep' ? 'font-medium text-[#b8531f]' : 'text-graphite'}>{waitingText}</span>
              <span className="text-ink">{row.nextAction}</span>
            </div>
            {row.needsReview && <p className="mt-0.5 text-[11px] text-status-warning">Sender not verified — review thread</p>}
          </>
        )
        const className = cn(
          'block w-full px-3 py-2 text-left transition-colors focus-visible:bg-bone focus-visible:outline-none',
          selected ? 'bg-bone shadow-[inset_2px_0_0_var(--color-orange)]' : 'hover:bg-bone/60',
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
