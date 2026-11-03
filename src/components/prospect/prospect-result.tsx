'use client'

/**
 * The Prospect result: extraction first, then the decision, then the why.
 *
 * The mental model is deliberately ANALYZE → WHAT RELAY EXTRACTED → WHAT RELAY
 * THINKS → WHY → WHAT SHOULD I DO. Facts (extraction) and inference (decision,
 * scoring) are labelled separately so a model reading is never presented as a
 * source fact.
 */

import { useState } from 'react'
import { AlertTriangle, ArrowRight, Check, ChevronDown, Copy, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScoreRing } from '@/components/score-ring'
import { ScoreBreakdown } from '@/components/score-breakdown'
import { RejectedSignalInspector } from '@/components/scoring/rejected-signal-inspector'
import { ScoringFeedback } from '@/components/scoring/scoring-feedback'
import { cn } from 'cn'
import { formatRoleLine } from '@/lib/leads/role-line'
import { ROUTING_MISMATCH_DELTA } from '@/lib/intelligence-v3/action/recommended-action'
import {
  confidenceLabel,
  decisionWordFor,
  enumLabel,
  primaryActionFor,
  relationshipLabel,
  sourceLabelFor,
} from '@/lib/prospect/display'
import type { ExtractedLead } from '@/lib/domain/types'
import type { AnalysisState } from './prospect-analyze'

export interface ProspectResultProps {
  result: AnalysisState
  /** Sending profile name, shown as attribution on the result. */
  profileName: string | null
  rawInput: string
  canSaveLead: boolean
  showDetails: boolean
  showSource: boolean
  onPrimaryAction: () => void
  onReanalyze: () => void
  onTryAnotherAngle: () => void
  onToggleDetails: () => void
  onToggleSource: () => void
  onSenderChange: (profileId: string) => void
  /** The sender currently in force, so a stronger match can be surfaced. */
  activeSenderId?: string | null
}

export function ProspectResult(props: ProspectResultProps) {
  const { result } = props

  const extracted = result.extracted
  if (!result.score || !extracted) {
    return <Unscorable result={result} onReanalyze={props.onReanalyze} />
  }

  const word = decisionWordFor(
    result.decision?.recommendedAction?.action ?? null,
    result.score.qualification,
  )
  const action = primaryActionFor(word)

  return (
    <div className="space-y-5">
      {props.profileName ? (
        <p className="text-[12px] text-graphite">
          Analyzed for: <span className="font-medium text-ink">{props.profileName}</span>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <ExtractedProfile
          extracted={extracted}
          completeness={result.extractionCompleteness}
          canonical={result.canonical}
          profileName={props.profileName}
          onToggleSource={props.onToggleSource}
          showSource={props.showSource}
          rawInput={props.rawInput}
        />
        <DecisionPanel
          result={result}
          word={word}
          action={action}
          canSaveLead={props.canSaveLead}
          showDetails={props.showDetails}
          onPrimaryAction={props.onPrimaryAction}
          onToggleDetails={props.onToggleDetails}
        />
      </div>

      <WhyPanel result={result} />

      <SenderMatch result={result} activeSenderId={props.activeSenderId ?? null} onSenderChange={props.onSenderChange} />

      <ConnectionNoteBlock result={result} onTryAnotherAngle={props.onTryAnotherAngle} />

      <AdvancedDetails
        result={result}
        show={props.showDetails}
        onToggle={props.onToggleDetails}
      />
    </div>
  )
}

// ── Extracted profile ────────────────────────────────────────────────────────

function ExtractedProfile({
  extracted,
  completeness,
  canonical,
  profileName,
  showSource,
  onToggleSource,
  rawInput,
}: {
  extracted: ExtractedLead
  completeness: { score?: number; missingFields?: string[] } | null
  canonical: AnalysisState['canonical']
  profileName: string | null
  showSource: boolean
  onToggleSource: () => void
  rawInput: string
}) {
  const confidence = confidenceLabel(completeness?.score)
  const relationship = relationshipLabel(canonical?.intelligence?.relationship)
  const source = sourceLabelFor(canonical?.rawSource?.sourceType) ?? sourceFromUrl(extracted.url)
  const evidence = sourceEvidence(extracted)

  return (
    <section aria-labelledby="prospect-extracted-profile" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="prospect-extracted-profile"
          className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone"
        >
          Extracted profile
        </h2>
        {confidence ? (
          <p className="text-[11px] text-stone">
            Identity confidence: <span className="font-medium text-ink">{confidence}</span>
          </p>
        ) : null}
      </div>

      <div className="mt-3">
        <h3 className="text-[16px] font-medium tracking-[-0.01em] text-ink">
          {extracted.name ?? 'Not stated'}
        </h3>
        <p className="mt-0.5 text-[12px] text-graphite">
          {formatRoleLine(extracted.title ?? extracted.titleRaw, extracted.company)}
        </p>
      </div>

      {typeof completeness?.score === 'number' && completeness.score < 75 && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-status-warning">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          <span>
            We found part of this profile
            {completeness.missingFields?.length
              ? ` but couldn’t confidently identify ${completeness.missingFields
                  .slice(0, 3)
                  .map((field) => field.replaceAll('_', ' '))
                  .join(', ')}`
              : ' but could not confirm every detail'}
            .
          </span>
        </p>
      )}

      <p className="mt-4 text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">
        Extracted fact
      </p>
      <dl className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label="Role" value={extracted.title ?? extracted.titleRaw} />
        <Field label="Company" value={extracted.company} />
        <Field label="Location" value={extracted.locationRaw} />
        <Field label="Source" value={source} />
        <Field label="Relationship" value={relationship} />
        <Field label="Sending profile" value={profileName} />
      </dl>

      {evidence.length > 0 && (
        <div className="mt-4">
          <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">
            Source evidence
          </p>
          <ul className="mt-2 space-y-1.5">
            {evidence.map((quote) => (
              <li key={quote} className="border-l-2 border-line pl-2.5 text-[12px] italic text-graphite">
                “{quote}”
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onToggleSource}
        aria-expanded={showSource}
        className="mt-4 flex items-center gap-1 text-[11px] text-stone transition-colors hover:text-ink"
      >
        <ChevronDown className={cn('size-3 transition-transform', showSource && 'rotate-180')} aria-hidden="true" />
        {showSource ? 'Hide original source' : 'View original source'}
      </button>
      {showSource && (
        <pre className="mt-2 max-h-[18rem] overflow-auto rounded-lg border border-line bg-bone-raised p-3 font-mono text-[11px] whitespace-pre-wrap text-graphite">
          {rawInput}
        </pre>
      )}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-ink" title={value ?? undefined}>
        {value && value.trim() ? value : 'Not stated'}
      </dd>
    </div>
  )
}

function sourceFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    if (host.includes('linkedin.')) return 'LinkedIn'
    if (host.includes('upwork.')) return 'Upwork'
    return host.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Verbatim quotes the extraction actually holds — never paraphrase as evidence. */
function sourceEvidence(extracted: ExtractedLead): string[] {
  const quotes = [extracted.verbatimQuote, ...(extracted.recentPosts ?? []).map((p) => p.verbatimQuote)]
  return quotes.filter((q): q is string => typeof q === 'string' && q.trim().length > 0).slice(0, 3)
}

// ── Opportunity decision ─────────────────────────────────────────────────────

function DecisionPanel({
  result,
  word,
  action,
  canSaveLead,
  showDetails,
  onPrimaryAction,
  onToggleDetails,
}: {
  result: AnalysisState
  word: ReturnType<typeof decisionWordFor>
  action: ReturnType<typeof primaryActionFor>
  canSaveLead: boolean
  showDetails: boolean
  onPrimaryAction: () => void
  onToggleDetails: () => void
}) {
  const revenue = result.revenue
  const reason = result.decision?.recommendedAction?.reason ?? revenue?.why ?? null
  const primaryDisabled = !canSaveLead && action.kind !== 'dismiss'

  return (
    <section aria-labelledby="prospect-decision" className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="prospect-decision" className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Opportunity decision
        </h2>
        <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">
          Relay interpretation
        </p>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <ScoreRing
          canonicalScore={result.score!.total}
          displayValue={result.score!.displayScore}
          size={56}
          label={`Opportunity score ${result.score!.displayScore}/10`}
        />
        <div className="min-w-0">
          <p className="text-[18px] font-medium tracking-[-0.01em] text-ink">{word}</p>
          <p className="text-[12px] text-graphite">
            {result.score!.displayScore} / 10
          </p>
        </div>
      </div>

      {revenue && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <SignalChip label="Fit" value={revenue.fit} />
          <SignalChip label="Intent" value={revenue.intent} />
          <SignalChip label="Decision confidence" value={revenue.confidence} />
        </div>
      )}

      {reason && (
        <div
          data-testid="decision-why"
          className="mt-3 rounded-lg border border-line bg-bone-raised/40 p-3"
        >
          <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">
            Recommended action
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-graphite">{reason}</p>
          {revenue?.nextAction && <p className="mt-1 text-[11px] text-stone">Next: {revenue.nextAction}</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="orange"
          onClick={onPrimaryAction}
          disabled={primaryDisabled}
          data-testid="prospect-primary-action"
        >
          {primaryDisabled ? 'Lead not eligible' : action.label}
          {primaryDisabled ? null : <ArrowRight className="size-3" aria-hidden="true" />}
        </Button>
        <Button variant="ghost" size="sm" onClick={onToggleDetails} aria-expanded={showDetails}>
          <ChevronDown className={cn('size-3 transition-transform', showDetails && 'rotate-180')} aria-hidden="true" />
          {showDetails ? 'Hide details' : 'View details'}
        </Button>
      </div>
    </section>
  )
}

function SignalChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-bone-raised px-2.5 py-2">
      <p className="text-mono-medium text-[8px] leading-tight uppercase tracking-[0.1em] text-stone">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-medium text-ink">{value}</p>
    </div>
  )
}

// ── Why ──────────────────────────────────────────────────────────────────────

function WhyPanel({ result }: { result: AnalysisState }) {
  const strongest = result.score?.reasons ?? []
  const missing = [...(result.score?.watchOut ?? []), ...(result.score?.missingInfo ?? [])]
  const context = commercialContext(result)

  if (strongest.length === 0 && missing.length === 0 && context.length === 0) return null

  return (
    <section aria-labelledby="prospect-why" className="border-t border-line pt-4">
      <h2 id="prospect-why" className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
        Why Relay decided this
      </h2>

      <div className="mt-3 grid gap-5 sm:grid-cols-3">
        <EvidenceGroup title="Strongest evidence" tone="success" items={strongest} />
        <EvidenceGroup title="Missing evidence" tone="warning" items={missing} />
        <div className="min-w-0">
          <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Commercial context</p>
          <dl className="mt-2 space-y-1.5">
            {context.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 text-[12px]">
                <dt className="text-graphite">{row.label}</dt>
                <dd className="text-right font-medium text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}

function EvidenceGroup({ title, tone, items }: { title: string; tone: 'success' | 'warning'; items: string[] }) {
  if (items.length === 0) return null
  const Icon = tone === 'success' ? Check : AlertTriangle
  const color = tone === 'success' ? 'text-status-success' : 'text-status-warning'
  return (
    <div className="min-w-0">
      <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">{title}</p>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-1.5 text-[12px] leading-relaxed text-graphite">
            <Icon className={cn('mt-0.5 size-3 shrink-0', color)} aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function commercialContext(result: AnalysisState): Array<{ label: string; value: string }> {
  const resolved = result.decision?.resolved ?? null
  const rows: Array<{ label: string; value: string }> = []
  const push = (label: string, value: string | null | undefined) => {
    const label2 = enumLabel(value)
    if (label2) rows.push({ label, value: label2 })
  }

  push('Buyer intent', result.revenue?.intent)
  push('Commercial potential', resolved?.commercialPotential)
  push('Authority', resolved?.authority)
  push('Timing', resolved?.buyerTiming)
  push('Access', resolved?.access)
  push('Capability fit', resolved?.fit)
  if (typeof resolved?.evidenceQuality === 'number') {
    rows.push({ label: 'Evidence quality', value: `${Math.round(resolved.evidenceQuality)}%` })
  }
  return rows
}

// ── Sender match ─────────────────────────────────────────────────────────────

function SenderMatch({
  result,
  activeSenderId,
  onSenderChange,
}: {
  result: AnalysisState
  activeSenderId: string | null
  onSenderChange: (id: string) => void
}) {
  const rankings = result.senderRankings ?? []
  const best = rankings[0]
  const visible = rankings.slice(0, 3)
  const others = rankings.slice(3)
  const [showOthers, setShowOthers] = useState(false)
  const activeId = activeSenderId ?? result.bestSender?.id ?? null
  const active = rankings.find((ranking) => ranking.senderId === activeId) ?? null
  const stronger =
    rankings.find(
      (ranking) =>
        ranking.senderId !== activeId &&
        active != null &&
        ranking.profileMatch - active.profileMatch >= ROUTING_MISMATCH_DELTA,
    ) ?? null
  const delta = stronger && active ? stronger.profileMatch - active.profileMatch : 0
  const bestName = best?.name ?? result.bestSender?.label ?? null

  return (
    <section data-testid="sender-section" aria-labelledby="prospect-sender" className="border-t border-line pt-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="prospect-sender" className="text-[13px] font-medium text-ink">Sender match</h2>
        {result.alternativeSenders.length > 0 || others.length > 0 ? (
          <span className="text-[11px] text-stone">Other profiles available</span>
        ) : null}
      </div>

      <p className="mt-1.5 text-[13px] text-ink">
        Sending as: <span className="font-medium">{bestName ?? 'Profile not assigned'}</span>
        {best ? <span className="text-graphite"> · {best.profileMatch}% sender match</span> : null}
      </p>
      {(best?.reasons[0] ?? result.bestSenderProof[0]?.safeClaim) && (
        <p className="mt-0.5 text-[11px] text-graphite">
          {(best?.reasons[0] ?? result.bestSenderProof[0]?.safeClaim ?? '').slice(0, 140)}
        </p>
      )}
      {rankings.length === 0 && !result.bestSender && (
        <p className="mt-1.5 text-[12px] text-graphite">No LinkedIn profile is available for this check.</p>
      )}

      {stronger && (
        <div data-testid="sender-mismatch" className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-[12px] font-medium text-amber-800">Another sender is a stronger match</p>
          <p className="mt-1 text-[12px] text-amber-700">
            <span className="font-medium">{stronger.name ?? 'Another profile'}</span> is +{delta}% stronger for this
            lead. Current sender: {active?.name ?? 'Unknown'} ({active?.profileMatch ?? 0}%).
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2 h-7 text-[11px]"
            onClick={() => onSenderChange(stronger.senderId)}
          >
            Use {stronger.name ?? 'this sender'}
          </Button>
        </div>
      )}

      {visible.length > 1 && (
        <ul className="mt-2 space-y-1">
          {visible.map((ranking, index) => (
            <li key={ranking.senderId}>
              <button
                type="button"
                onClick={() => onSenderChange(ranking.senderId)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[11px] transition-colors',
                  ranking.senderId === activeId ? 'bg-bone text-ink' : 'text-graphite hover:text-ink',
                )}
              >
                <span className="w-4 shrink-0 text-stone">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {ranking.name ?? 'Unnamed'}
                  {ranking.role ? <span className="font-normal"> · {ranking.role}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums">{ranking.profileMatch}%</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShowOthers((value) => !value)}
            aria-expanded={showOthers}
            className="flex items-center gap-1 text-[11px] text-stone transition-colors hover:text-ink"
          >
            <ChevronDown className={cn('size-3 transition-transform', showOthers && 'rotate-180')} aria-hidden="true" />
            Other profiles ({others.length})
          </button>
          {showOthers && (
            <ul className="mt-1 space-y-1">
              {others.map((ranking, index) => (
                <li key={ranking.senderId}>
                  <button
                    type="button"
                    onClick={() => onSenderChange(ranking.senderId)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[11px] transition-colors',
                      ranking.senderId === activeId ? 'bg-bone text-ink' : 'text-graphite hover:text-ink',
                    )}
                  >
                    <span className="w-4 shrink-0 text-stone">{index + 4}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {ranking.name ?? 'Unnamed'}
                      {ranking.role ? <span className="font-normal"> · {ranking.role}</span> : null}
                    </span>
                    <span className="shrink-0 tabular-nums">{ranking.profileMatch}%</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result.senderSuggestion && (
        <div data-testid="sender-suggestion" className="mt-2 rounded-md border border-orange/30 bg-orange/5 p-2.5">
          <p className="text-[11px] font-medium text-ink">
            Relay suggests: {result.senderSuggestion.name ?? 'another profile'}
            {result.senderSuggestion.role ? (
              <span className="font-normal text-graphite"> · {result.senderSuggestion.role}</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-[11px] text-graphite">{result.senderSuggestion.reason}</p>
        </div>
      )}
    </section>
  )
}

// ── Connection note ──────────────────────────────────────────────────────────

function ConnectionNoteBlock({
  result,
  onTryAnotherAngle,
}: {
  result: AnalysisState
  onTryAnotherAngle: () => void
}) {
  const [copied, setCopied] = useState(false)
  if (!result.connectionNote) {
    return (
      <section className="rounded-lg border border-dashed border-line bg-bone-raised/40 p-3">
        <p className="text-[12px] text-graphite">{noNoteCopy(result)}</p>
        <div className="mt-2">
          <Button variant="ghost" size="sm" onClick={onTryAnotherAngle}>
            <Sparkles className="size-3" aria-hidden="true" />
            Try another angle
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="border-t border-line pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-medium text-ink">
          {result.revenue && !result.revenue.messageRecommended ? 'Message' : 'Connection note'}
        </h2>
        <span
          className={cn(
            'font-mono text-[11px]',
            result.charCount > result.maxChars ? 'text-status-danger' : 'text-stone',
          )}
        >
          {result.charCount} / {result.maxChars}
        </span>
      </div>
      <div className="mt-2 rounded-lg bg-bone p-3">
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{result.connectionNote}</p>
      </div>
      {!result.quality.passed && result.quality.failures.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {result.quality.failures.slice(0, 3).map((f) => (
            <span key={f} className="text-[10px] text-status-warning">{f}</span>
          ))}
        </div>
      )}
      {result.draftFailed && (
        <p className="mt-1 text-[10px] text-status-warning">Draft generation failed — using fallback.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="orange" size="sm" onClick={() => void copyText(result.connectionNote, setCopied)}>
          {copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy note'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onTryAnotherAngle}>
          <RefreshCw className="size-3" aria-hidden="true" />
          Try another angle
        </Button>
      </div>
    </section>
  )
}

function noNoteCopy(result: AnalysisState): string {
  switch (result.revenue?.act) {
    case 'SKIP':
      return 'No outreach recommended — this profile is not a fit.'
    case 'RESEARCH_MORE':
      return 'Research before contacting — add identifying and opportunity details, then create a lead.'
    case 'CONNECT_OR_OBSERVE':
      return 'No pitch recommended — create a lead to save this profile to your watchlist.'
    case 'CONTACT_NOW':
      return 'Analysis complete — create a lead to start outreach from the lead detail page.'
    default:
      return 'Analysis complete — qualification and signals are shown above.'
  }
}

// ── Advanced details ─────────────────────────────────────────────────────────

function AdvancedDetails({
  result,
  show,
  onToggle,
}: {
  result: AnalysisState
  show: boolean
  onToggle: () => void
}) {
  const resolved = result.decision?.resolved ?? null
  return (
    <section className="border-t border-line pt-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={show}
        className="flex items-center gap-1 text-[11px] text-stone transition-colors hover:text-ink"
      >
        <ChevronDown className={cn('size-3 transition-transform', show && 'rotate-180')} aria-hidden="true" />
        {show ? 'Hide scoring details' : 'Show scoring details'}
      </button>

      {show && (
        <div className="mt-3 space-y-4">
          <div className="min-w-0">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Scoring details</p>
            <div className="mt-2">
              <ScoreBreakdown
                dimensions={result.score!.dimensions}
                calculation={result.score!.calculation}
                decisionAdjustments={result.score!.decisionAdjustments ?? []}
                canonicalScore={result.score!.total}
              />
            </div>
          </div>

          {(result.decision.rejectedSignals?.length ?? 0) > 0 && (
            <div className="min-w-0">
              <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Decision safeguards</p>
              <RejectedSignalInspector signals={result.decision.rejectedSignals ?? []} compact className="mt-2" />
            </div>
          )}

          {typeof resolved?.evidenceQuality === 'number' && (
            <p className="text-[11px] text-graphite">
              Evidence quality: <span className="font-medium text-ink">{Math.round(resolved.evidenceQuality)}%</span>
            </p>
          )}

          {result.decision.versions && (
            <p className="text-[10px] text-stone">
              Scoring {result.decision.versions.scoringVersion} · model {result.decision.versions.modelVersion}
            </p>
          )}

          {result.decision.decisionRunId && (
            <ScoringFeedback
              decisionRunId={result.decision.decisionRunId}
              observed={{
                score: result.score!.total,
                displayScore: result.score!.displayScore,
                qualification: result.score!.qualification,
                action: result.decision.recommendedAction?.action ?? '',
                versions: result.decision.versions,
              }}
            />
          )}
        </div>
      )}
    </section>
  )
}

// ── Unscorable input ─────────────────────────────────────────────────────────

function Unscorable({ result, onReanalyze }: { result: AnalysisState; onReanalyze: () => void }) {
  return (
    <div className="border-l-2 border-status-warning/40 pl-4">
      <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-status-warning">
        {result.inputHeadline ?? 'Insufficient profile information'}
      </p>
      <p className="mt-1 text-[14px] font-medium text-ink">
        {result.inputStatus === 'not_prospect'
          ? 'This paste can’t be qualified — it doesn’t describe a prospect.'
          : 'Relay could not verify enough evidence to score this prospect.'}
      </p>
      {result.revenue?.noMessageReason && (
        <p className="mt-1 text-[12px] text-graphite">{result.revenue.noMessageReason}</p>
      )}
      <p className="mt-1 text-[12px] text-graphite">Not scored — there is no valid prospect to score.</p>
      {(result.qualification?.missingCritical.length ?? 0) > 0 && (
        <p className="mt-2 text-[12px] text-graphite">
          Missing: {result.qualification.missingCritical.join(', ')}.
        </p>
      )}
      <p className="mt-2 text-[12px] text-ink">
        Add identifying and opportunity details to continue: the person’s name and role, their company, and the job,
        project, or need you are qualifying.
      </p>
      <Button variant="ghost" size="sm" className="mt-2" onClick={onReanalyze}>
        <RefreshCw className="size-3" aria-hidden="true" />
        Re-analyze
      </Button>
    </div>
  )
}

// ── Created confirmation ─────────────────────────────────────────────────────

export function ProspectCreated({
  leadId,
  company,
  onOpen,
  onReset,
}: {
  leadId: string
  company: string | null
  onOpen: () => void
  onReset: () => void
}) {
  return (
    <div data-testid="prospect-created" className="rounded-xl border border-status-success/30 bg-status-success/5 p-5">
      <p className="flex items-center gap-2 text-[15px] font-medium text-status-success">
        <Check className="size-4" aria-hidden="true" />
        Lead created
      </p>
      <p className="mt-1.5 text-[13px] text-graphite">
        {company ? `${company} is now in your Sales workspace.` : 'This prospect is now in your Sales workspace.'}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="orange" onClick={onOpen}>
          Open Lead
          <ArrowRight className="size-3" aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onReset}>
          Check another
        </Button>
      </div>
      {/* The lead id is kept for the open action but never rendered as a raw blob. */}
      <span className="sr-only" data-lead-id={leadId} />
    </div>
  )
}

// ── Loading ──────────────────────────────────────────────────────────────────

export function ProspectLoadingSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex min-h-[12rem] flex-col justify-center rounded-xl border border-dashed border-line bg-bone-raised/40 px-6 py-6">
      <p className="text-sm font-medium text-ink">Analyzing source</p>
      <ol className="mt-3 space-y-2">
        {steps.map((step, index) => {
          const done = index < current
          const active = index === current
          return (
            <li key={step} className="flex items-center gap-2.5 text-[12px]">
              {done ? (
                <Check className="size-3.5 text-status-success" aria-hidden="true" />
              ) : (
                <span
                  className={cn(
                    'size-3.5 rounded-full border',
                    active ? 'border-orange gentle-pulse' : 'border-line',
                  )}
                  aria-hidden="true"
                />
              )}
              <span className={done ? 'text-graphite' : active ? 'text-ink' : 'text-stone'}>{step}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

async function copyText(text: string, setCopied: (v: boolean) => void) {
  try {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  } catch {
    // Clipboard may be unavailable
  }
}
