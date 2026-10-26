'use client'

import Link from 'next/link'
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw } from 'lucide-react'
import { cn } from 'cn'
import { SCORING_VERSION } from '@/lib/intelligence-v3/versions'
import { deriveConversationPresence } from '@/lib/relay/conversation-presence'
import type { LeadDetail } from '@/lib/store/types'

interface Thesis {
  whyThisAccount?: string | null
  likelyOpportunity?: string | null
  whyUs?: string | null
  whyThisSender?: string | null
  bestEntryPoint?: string | null
  missingEvidence?: string[] | null
  risks?: string[] | null
  confidence?: string | null
  basis?: Record<string, 'FACT' | 'HYPOTHESIS' | 'UNKNOWN'> | null
}

const BASIS_LABEL: Record<string, { label: string; className: string }> = {
  FACT: { label: 'Fact', className: 'bg-status-success/10 text-status-success' },
  HYPOTHESIS: { label: 'Hypothesis', className: 'bg-status-warning/10 text-status-warning' },
  UNKNOWN: { label: 'Unverified', className: 'bg-bone text-stone' },
}

function BasisTag({ basis }: { basis?: string | null }) {
  if (!basis) return null
  const cfg = BASIS_LABEL[basis] ?? BASIS_LABEL.UNKNOWN
  return <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide', cfg.className)}>{cfg.label}</span>
}

/**
 * The trust strip on Lead Detail: thread verification, score staleness and the
 * auto-derived sales thesis. A hypothesis is never rendered like a fact.
 */
export function LeadTrustAndThesis({ lead }: { lead: LeadDetail }) {
  const messages = lead.messages ?? []

  // Presence comes from the same thread the Conversation tab and Archive read,
  // so a lead with a visible inbound is never called "no conversation".
  const presence = deriveConversationPresence(lead)
  const unverified = messages.filter((m) => m.direction === 'inbound' && m.threadStatus === 'UNVERIFIED').length

  const version = (lead as { scoreVersion?: string | null }).scoreVersion ?? null
  const canonicalScore = (lead as { canonicalScore?: number | null }).canonicalScore ?? null
  const stale = version != null && version !== SCORING_VERSION
  const unscored = canonicalScore == null && version == null

  const ci = (lead.canonicalIntelligence ?? null) as Record<string, unknown> | null
  const thesis = (ci?.salesThesis ?? ci?.thesis ?? null) as Thesis | null

  return (
    <section className="space-y-4 rounded-lg border border-line bg-bone-raised p-5" aria-label="Trust and sales thesis">
      {/* Thread trust */}
      <div className="flex items-start gap-3">
        {presence === 'UNVERIFIED_THREAD' ? (
          <>
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">Thread identity not verified</p>
              <p className="text-[12px] text-graphite">
                {unverified} inbound {unverified === 1 ? 'message has' : 'messages have'} no verified sender. Confirm the identity before treating this as conversation history.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" className="rounded-md bg-solid px-2 py-1 text-[11px] font-medium text-on-solid hover:opacity-90">Confirm</button>
                <Link href={`/leads/${lead.id}?tab=sender`} className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-graphite hover:text-ink">Reassign</Link>
                <button type="button" className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-graphite hover:text-ink">Dismiss</button>
              </div>
            </div>
          </>
        ) : presence === 'NO_MESSAGES' ? (
          <>
            <HelpCircle className="mt-0.5 size-4 shrink-0 text-stone" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-medium text-ink">No conversation thread</p>
              <p className="text-[12px] text-graphite">This lead has no messages yet, so there is no thread to verify.</p>
            </div>
          </>
        ) : presence === 'MISMATCH_REVIEW' ? (
          <>
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-medium text-ink">Thread needs review</p>
              <p className="text-[12px] text-graphite">A message on this thread does not match the lead&apos;s contact. Confirm the sender before treating it as conversation history.</p>
            </div>
          </>
        ) : presence === 'DISMISSED_THREAD' ? (
          <>
            <HelpCircle className="mt-0.5 size-4 shrink-0 text-stone" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-medium text-ink">Thread dismissed</p>
              <p className="text-[12px] text-graphite">This conversation was reviewed and dismissed, so it is not part of the active thread.</p>
            </div>
          </>
        ) : (
          <>
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden="true" />
            <p className="text-[12px] text-graphite">Thread identity verified.</p>
          </>
        )}
      </div>

      {/* Score staleness */}
      <div className="flex items-start gap-3 border-t border-line/60 pt-3">
        {unscored ? (
          <>
            <HelpCircle className="mt-0.5 size-4 shrink-0 text-stone" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-medium text-ink">Not analyzed yet</p>
              <p className="text-[12px] text-graphite">Re-analyze from the stored research to get a canonical score.</p>
            </div>
          </>
        ) : stale ? (
          <>
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">Analyzed with an older intelligence version</p>
              <p className="text-[12px] text-graphite">Stored {version}. Current is {SCORING_VERSION}.</p>
              <button type="button" className="mt-2 inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-graphite hover:text-ink">
                <RefreshCw className="size-3" aria-hidden="true" />Re-analyze
              </button>
            </div>
          </>
        ) : (
          <>
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden="true" />
            <p className="text-[12px] text-graphite">Scored with the current intelligence version.</p>
          </>
        )}
      </div>

      {/* Sales thesis */}
      {thesis && (
        <div className="space-y-2 border-t border-line/60 pt-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-stone">Sales thesis</p>
          <ThesisRow basis={thesis.basis?.whyThisAccount} label="Why this account" value={thesis.whyThisAccount} />
          <ThesisRow basis={thesis.basis?.likelyOpportunity} label="Likely opportunity" value={thesis.likelyOpportunity} />
          <ThesisRow basis={thesis.basis?.whyUs} label="Why us" value={thesis.whyUs} />
          <ThesisRow basis={thesis.basis?.whyThisSender} label="Why this sender" value={thesis.whyThisSender} />
          <ThesisRow basis={thesis.basis?.bestEntryPoint} label="Best entry point" value={thesis.bestEntryPoint} />
          {thesis.missingEvidence && thesis.missingEvidence.length > 0 && (
            <div className="flex items-start gap-2 text-[12px]">
              <span className="shrink-0 font-medium text-stone">Missing evidence</span>
              <span className="text-graphite">{thesis.missingEvidence.join('; ')}</span>
            </div>
          )}
          {thesis.risks && thesis.risks.length > 0 && (
            <div className="flex items-start gap-2 text-[12px]">
              <span className="shrink-0 font-medium text-stone">Risks</span>
              <span className="text-graphite">{thesis.risks.join('; ')}</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function ThesisRow({ label, value, basis }: { label: string; value?: string | null; basis?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex w-32 shrink-0 items-center gap-1 text-[11px] font-medium text-stone">
        {label}
        <BasisTag basis={basis} />
      </span>
      <p className="min-w-0 flex-1 text-[12px] text-graphite">{value}</p>
    </div>
  )
}
