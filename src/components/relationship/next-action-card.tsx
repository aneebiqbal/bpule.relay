'use client'

import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { ArrowRight, Clock, MessageSquare } from 'lucide-react'
import type { RelationshipState } from '@/lib/relay/relationship-state'

interface NextActionCardProps {
  state: RelationshipState
  onPrimaryAction?: () => void
  onSecondaryAction?: () => void
  onPasteReply?: () => void
  contactName?: string | null
}

export function NextActionCard({
  state,
  onPrimaryAction,
  onSecondaryAction,
  onPasteReply,
  contactName,
}: NextActionCardProps) {
  const isYourMove = state.kind === 'your_move'
  const isTheirMove = state.kind === 'their_move'
  const isTerminal = state.kind === 'won' || state.kind === 'lost'
  const who = contactName ?? 'them'

  if (isTerminal) {
    return (
      <div className={cn(
        'rounded-xl border p-5',
        state.kind === 'won'
          ? 'border-status-success/20 bg-status-success/5'
          : 'border-line bg-bone-raised/50',
      )}>
        <p className={cn(
          'text-[11px] font-medium uppercase tracking-[0.14em]',
          state.kind === 'won' ? 'text-status-success' : 'text-stone',
        )}>
          {state.kind === 'won' ? 'Opportunity won' : 'Opportunity lost'}
        </p>
        <p className="mt-1.5 text-[14px] text-graphite">{state.detail}</p>
      </div>
    )
  }

  return (
    <div className={cn(
      'rounded-xl border p-5 transition-all duration-200',
      isYourMove
        ? 'border-orange/20 bg-orange/[0.03]'
        : 'border-line bg-bone-raised/30',
    )}>
      {/* Kind label */}
      <div className="flex items-center gap-2">
        <span className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]',
          isYourMove
            ? 'bg-orange/10 text-orange'
            : 'bg-bone-raised text-stone',
        )}>
          {isYourMove ? (
            <>
              <span className="size-1.5 rounded-full bg-orange gentle-pulse" />
              Your move
            </>
          ) : (
            <>
              <Clock className="size-3" />
              Their move
            </>
          )}
        </span>
      </div>

      {/* Title */}
      <p className="mt-3 text-[16px] font-medium leading-snug text-ink">
        {isYourMove ? state.title : state.title.replace('Waiting for connection', `Waiting for ${who}`)}
      </p>

      {/* Detail */}
      <p className="mt-1.5 text-[13px] leading-relaxed text-graphite">
        {state.detail}
      </p>

      {/* Last action context */}
      {state.lastActionLabel && state.lastActionAt && (
        <p className="mt-2 text-[11px] text-stone">
          {state.lastActionLabel} · {formatRelative(state.lastActionAt)}
        </p>
      )}

      {/* Client message preview */}
      {state.lastClientMessage && isYourMove && state.phase === 'replied' && (
        <div className="mt-3 rounded-md border border-line bg-bone p-3">
          <div className="flex items-center gap-1.5 text-[10px] text-stone">
            <MessageSquare className="size-3" />
            {contactName ?? 'They'} said
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink line-clamp-3">
            &ldquo;{state.lastClientMessage.sentText}&rdquo;
          </p>
        </div>
      )}

      {/* Waiting info */}
      {isTheirMove && state.waitingSince && (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-stone">
          <Clock className="size-3.5" />
          Waiting since {formatRelative(state.waitingSince)}
        </p>
      )}

      {/* Primary action */}
      {isYourMove && onPrimaryAction && (
        <div className="mt-4">
          <Button variant="orange" onClick={onPrimaryAction} className="w-full sm:w-auto">
            {state.primaryCta}
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      )}

      {/* Secondary actions */}
      {isTheirMove && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {onPasteReply && (
            <Button variant="outline" size="sm" onClick={onPasteReply}>
              <MessageSquare className="size-3.5" />
              Paste Client Reply
            </Button>
          )}
          {onSecondaryAction && state.secondaryCta && (
            <Button variant="ghost" size="sm" onClick={onSecondaryAction}>
              {state.secondaryCta}
            </Button>
          )}
        </div>
      )}
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
