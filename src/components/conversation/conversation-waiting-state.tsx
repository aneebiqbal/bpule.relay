'use client'

import { Clock, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ConversationWaitingStateProps {
  contactName?: string | null
  waitingOn: 'client' | 'connection'
  waitingSince?: string | null
  lastActionLabel?: string | null
  lastActionAt?: string | null
  followUpDueLabel?: string | null
  onPasteReply: () => void
  onLogUpdate?: () => void
  now: number
}

function formatRelative(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'just now'
  if (diff < 45_000) return 'just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/**
 * ConversationWaitingState — calm waiting state.
 * No false urgency. No broken-empty feeling.
 */
export function ConversationWaitingState({
  contactName,
  waitingOn,
  lastActionLabel,
  lastActionAt,
  onPasteReply,
}: ConversationWaitingStateProps) {
  const who = contactName ?? 'them'
  const waitingLabel = waitingOn === 'connection'
    ? `Waiting for ${who} to accept your connection`
    : `Waiting for ${who} to reply`

  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-bone-raised/20 p-4">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-bone-raised">
        <Clock className="size-3.5 text-stone" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink">{waitingLabel}</p>
        {lastActionLabel && lastActionAt && (
          <p className="mt-1 text-[11px] text-graphite">
            {lastActionLabel} · {formatRelative(lastActionAt)}
          </p>
        )}
        <p className="mt-2 text-[11px] text-stone">
          No action needed right now.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPasteReply}>
          <MessageSquare className="size-3" />
          Paste Reply
        </Button>
      </div>
    </div>
  )
}

/**
 * ConversationEmptyState — when no conversation exists yet.
 */
export function ConversationEmptyState({
  contactName,
  connectionAccepted,
  onPrepareDm,
  onMarkAccepted,
}: {
  contactName?: string | null
  connectionAccepted: boolean
  onPrepareDm: () => void
  onMarkAccepted?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line py-8 px-4 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-bone-raised mb-3">
        <MessageSquare className="size-4 text-stone" />
      </div>
      <p className="text-[13px] font-medium text-ink">
        {connectionAccepted
          ? 'No conversation yet'
          : `Waiting for ${contactName ?? 'them'} to accept your connection`}
      </p>
      <p className="mt-1 text-[12px] text-graphite">
        {connectionAccepted
          ? `${contactName ?? 'They'} accepted your connection. Start the conversation.`
          : 'Once they accept, Relay can help you start the conversation.'}
      </p>
      {connectionAccepted && (
        <Button variant="orange" size="sm" onClick={onPrepareDm} className="mt-4">
          Prepare First Message
        </Button>
      )}
      {!connectionAccepted && onMarkAccepted && (
        <Button variant="outline" size="sm" onClick={onMarkAccepted} className="mt-4">
          Mark Accepted
        </Button>
      )}
    </div>
  )
}

/**
 * FollowUpDue — shown when follow-up becomes due.
 */
export function FollowUpDue({
  contactName,
  daysSince,
  onPrepareFollowUp,
}: {
  contactName?: string | null
  daysSince?: number
  onPrepareFollowUp: () => void
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-orange/20 bg-orange/[0.03] p-4">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-orange/10">
        <Clock className="size-3.5 text-orange" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink">
          Time to follow up{contactName ? ` with ${contactName}` : ''}
        </p>
        <p className="mt-1 text-[11px] text-graphite">
          {daysSince
            ? `Your last message was ${daysSince} business days ago.`
            : 'No reply logged after 5 business days.'}
        </p>
      </div>
      <Button variant="orange" size="sm" onClick={onPrepareFollowUp}>
        Prepare Follow-Up
      </Button>
    </div>
  )
}

/**
 * ConversationSummary — collapsible summary for long threads.
 */
export function ConversationSummary({ summary }: { summary: string }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] text-graphite hover:text-ink transition-colors">
        <Clock className="size-3" />
        <span>Conversation so far</span>
      </summary>
      <p className="mt-2 rounded-md border border-line bg-bone-raised/30 p-3 text-[12px] leading-relaxed text-graphite whitespace-pre-wrap">
        {summary}
      </p>
    </details>
  )
}
