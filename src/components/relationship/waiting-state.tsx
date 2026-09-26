'use client'

import { cn } from 'cn'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MessageSquare } from 'lucide-react'
import type { RelationshipState } from '@/lib/relay/relationship-state'

interface WaitingStateProps {
  state: RelationshipState
  contactName?: string | null
  onPasteReply?: () => void
  onLogUpdate?: () => void
}

/**
 * Calm waiting state. No false urgency. No broken-empty feeling.
 */
export function WaitingState({ state, contactName, onPasteReply, onLogUpdate }: WaitingStateProps) {
  if (state.kind !== 'their_move') return null

  const who = contactName ?? 'them'
  const waitingLabel = state.waitingOn === 'connection'
    ? `Waiting for ${who} to accept your connection`
    : `Waiting for ${who} to reply`

  return (
    <div className="rounded-xl border border-line bg-bone-raised/20 p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-bone-raised">
          <Clock className="size-4 text-stone" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-ink">{waitingLabel}</p>
          {state.lastActionLabel && (
            <p className="mt-1 text-[12px] text-graphite">
              {state.lastActionLabel}{state.lastActionAt ? ` · ${formatRelative(state.lastActionAt)}` : ''}
            </p>
          )}
          {state.waitingSince && (
            <p className="mt-2 text-[11px] text-stone">
              No action needed right now.
            </p>
          )}
        </div>
      </div>

      {/* Escape hatches */}
      <div className="mt-4 flex flex-wrap items-center gap-2 pl-11">
        {onPasteReply && (
          <Button variant="outline" size="sm" onClick={onPasteReply}>
            <MessageSquare className="size-3.5" />
            They replied
          </Button>
        )}
        {onLogUpdate && (
          <Button variant="ghost" size="sm" onClick={onLogUpdate}>
            Log an update
          </Button>
        )}
      </div>
    </div>
  )
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
