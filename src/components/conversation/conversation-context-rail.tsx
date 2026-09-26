'use client'

import { Target, Trophy, Flame } from 'lucide-react'
import type { RelationshipState } from '@/lib/relay/relationship-state'
import type { ProofItem } from '@/lib/domain/types'

interface ConversationContextRailProps {
  state: RelationshipState
  company: string
  contactName?: string | null
  contactTitle?: string | null
  source?: string | null
  signalShort?: string | null
  signalEvidence?: string | null
  fit?: string | null
  intent?: string | null
  confidence?: string | null
  matchedProofs?: ProofItem[]
  followupsLeft?: number
}

/**
 * ConversationContextRail — desktop sidebar context.
 *
 * ~30–35% of desktop layout. Shows:
 * - relationship
 * - company
 * - opportunity
 * - relevant proof
 * - commercial stage
 *
 * No giant score cards. Compact, scannable.
 */
export function ConversationContextRail({
  state,
  company,
  source,
  signalShort,
  signalEvidence,
  fit,
  intent,
  confidence,
  matchedProofs = [],
  followupsLeft,
}: ConversationContextRailProps) {
  const showProof = matchedProofs.length > 0 && (
    matchedProofs[0].permissionOnFile && matchedProofs[0].clientName
      ? matchedProofs[0].clientName
      : matchedProofs[0].reviewQuote
  )

  return (
    <aside className="space-y-3 hidden lg:block">
      {/* Relationship state */}
      <div className="rounded-lg border border-line bg-bone-raised/20 p-3.5">
        <p className="text-[10px] uppercase tracking-[0.14em] text-stone mb-2.5">Relationship</p>
        <dl className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <dt className="text-[11px] text-stone">Stage</dt>
            <dd className="text-[12px] font-medium text-ink capitalize">{state.phase.replace(/_/g, ' ')}</dd>
          </div>
          {source && (
            <div className="flex items-baseline justify-between">
              <dt className="text-[11px] text-stone">Channel</dt>
              <dd className="text-[12px] text-ink capitalize">{source}</dd>
            </div>
          )}
          {fit && (
            <div className="flex items-baseline justify-between">
              <dt className="text-[11px] text-stone">Fit</dt>
              <dd className="text-[12px] text-ink">{fit}</dd>
            </div>
          )}
          {intent && (
            <div className="flex items-baseline justify-between">
              <dt className="text-[11px] text-stone">Intent</dt>
              <dd className="text-[12px] text-ink">{intent}</dd>
            </div>
          )}
          {confidence && (
            <div className="flex items-baseline justify-between">
              <dt className="text-[11px] text-stone">Confidence</dt>
              <dd className="text-[12px] text-ink">{confidence}</dd>
            </div>
          )}
          {followupsLeft !== undefined && followupsLeft < 3 && (
            <div className="flex items-baseline justify-between">
              <dt className="text-[11px] text-stone">Follow-ups used</dt>
              <dd className="text-[12px] text-ink">{3 - followupsLeft} of 3</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Signal */}
      {signalShort && (
        <div className="rounded-lg border border-line bg-bone-raised/20 p-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Flame className="size-3 text-orange" />
            <p className="text-[10px] uppercase tracking-[0.14em] text-stone">Signal</p>
          </div>
          <p className="text-[12px] font-medium text-orange">{signalShort}</p>
          {signalEvidence && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-graphite">{signalEvidence}</p>
          )}
        </div>
      )}

      {/* Proof */}
      {showProof && (
        <div className="rounded-lg border border-line bg-bone-raised/20 p-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Trophy className="size-3 text-orange" />
            <p className="text-[10px] uppercase tracking-[0.14em] text-stone">Proof</p>
          </div>
          {matchedProofs[0].permissionOnFile && matchedProofs[0].clientName && (
            <p className="text-[12px] text-ink">{matchedProofs[0].clientName}</p>
          )}
          {matchedProofs[0].reviewQuote && (
            <p className="mt-1 text-[11px] italic text-graphite">
              &ldquo;{matchedProofs[0].reviewQuote}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* Context drawer placeholder */}
      <details className="rounded-lg border border-line bg-bone-raised/20">
        <summary className="flex cursor-pointer items-center gap-2 p-3.5 text-[11px] text-graphite hover:text-ink transition-colors">
          <Target className="size-3" />
          <span>View context</span>
        </summary>
        <div className="border-t border-line px-3.5 pb-3.5 pt-2.5 space-y-2">
          <p className="text-[11px] text-stone">Why this lead matters</p>
          <p className="text-[12px] text-ink leading-relaxed">
            {signalEvidence ?? `${company} matches your target profile.`}
          </p>
          {state.lastActionLabel && state.lastActionAt && (
            <p className="text-[11px] text-stone mt-2">
              Last: {state.lastActionLabel} · {formatRelative(state.lastActionAt)}
            </p>
          )}
        </div>
      </details>
    </aside>
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
