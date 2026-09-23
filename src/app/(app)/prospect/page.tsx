'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  RefreshCw,
  Search,
  SkipForward,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ScoreRing } from '@/components/score-ring'
import { readSse } from '@/lib/sse/client'
import { cn } from 'cn'
import type { ExtractedLead, Profile, MatchedProof } from '@/lib/domain/types'

import type { ProspectQualificationAssessment } from '@/lib/prospect/qualification-gate'
import type { RevenueLoopSnapshot } from '@/lib/relay/revenue-strategy'

type AnalyzeEvent =
  | { type: 'status'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done'; draft?: unknown; matchedProof?: unknown; extracted?: undefined; qualification?: undefined; revenue?: undefined }
  | {
      type: 'done'
      extracted: ExtractedLead
      score: {
        total: number
        displayScore: number
        label: string
        qualification: string
        reasons: string[]
        watchOut: string[]
        dimensions: Array<{ label: string; points: number; max: number; note: string }>
        missingInfo: string[]
      } | null
      canonical: unknown
      bestSender: Profile | null
      bestSenderProof: MatchedProof[]
      connectionNote: string
      charCount: number
      maxChars: number
      quality: { passed: boolean; failures: string[]; wasRepaired: boolean }
      strategy: { whyConnect: string; relevantObservation: string; forbidden: string[]; candidateAngles: string[] }
      draftFailed: boolean
      demoMode: boolean
      alternativeSenders: Array<{ profile: Profile; matchScore: number; topProof: string | null }>
      qualification: ProspectQualificationAssessment
      revenue?: RevenueLoopSnapshot
    }

interface AnalysisState {
  extracted: ExtractedLead | null
  score: {
    total: number
    displayScore: number
    label: string
    qualification: string
    reasons: string[]
    watchOut: string[]
    dimensions: Array<{ label: string; points: number; max: number; note: string }>
    missingInfo: string[]
  } | null
  canonical: { extractionCompleteness?: { score?: number } } | null
  bestSender: Profile | null
  bestSenderProof: MatchedProof[]
  connectionNote: string
  charCount: number
  maxChars: number
  quality: { passed: boolean; failures: string[]; wasRepaired: boolean }
  strategy: { whyConnect: string; relevantObservation: string; forbidden: string[]; candidateAngles: string[] }
  alternativeSenders: Array<{ profile: Profile; matchScore: number; topProof: string | null }>
  draftFailed: boolean
  demoMode: boolean
  qualification: ProspectQualificationAssessment
  revenue: RevenueLoopSnapshot | null
}

const QUALIFICATION_META: Record<string, { label: string; color: string; bg: string }> = {
  strong: { label: 'Strong opportunity', color: 'text-status-success', bg: 'bg-status-success/10' },
  worth_pursuing: { label: 'Worth pursuing', color: 'text-status-success', bg: 'bg-status-success/10' },
  maybe: { label: 'Maybe — needs more signal', color: 'text-orange', bg: 'bg-orange/10' },
  skip: { label: 'Probably skip', color: 'text-graphite', bg: 'bg-stone/10' },
}

function pasteGuard(raw: string): string | null {
  if (!raw.trim()) return 'Paste some profile text first.'
  if (/^https?:\/\/\S+\s*$/i.test(raw.trim())) {
    return 'That is just a URL. Paste the profile text alongside it.'
  }
  if (raw.trim().length < 24) {
    return 'That paste is too short. Add more profile text.'
  }
  return null
}

export default function ProspectCheckPage() {
  const router = useRouter()
  const errorRef = useRef<HTMLDivElement | null>(null)
  const [rawInput, setRawInput] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisState | null>(null)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [showSenders, setShowSenders] = useState(false)
  const [duplicateConflict, setDuplicateConflict] = useState<{
    existingLeadId: string
    existingLeadCompany: string
    duplicateKind: 'hard' | 'potential'
    canCreateSeparate: boolean
    reason?: string
  } | null>(null)
  const rawRef = useRef<HTMLTextAreaElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const saveInFlightRef = useRef(false)

  // Preserve sender preference across re-analyses
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  // Clicking "Create lead" happens near the bottom of a long results panel,
  // but the error banner renders at the top of the page — without this, a
  // failed save looks like the button did nothing (TEAM-002 / relay.bpulse.dev report).
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

  const resetResult = useCallback(() => {
    setResult(null)
    setError(null)
    setStatus(null)
    setCopied(false)
    setShowDetails(false)
    setShowSenders(false)
    setDuplicateConflict(null)
  }, [])

  async function analyze(mode: 'analyze' | 'try-another-angle' = 'analyze') {
    const guard = pasteGuard(rawInput)
    if (guard) {
      setError(guard)
      rawRef.current?.focus()
      return
    }

    // "Try Another Angle" must never re-derive canonical evidence/score/
    // qualification/action — only a new message angle. Capture the
    // ALREADY-HELD canonical result before resetResult() clears it, and
    // send it back so the server can verify (not just trust) it's still
    // valid for this exact input and skip re-extraction/re-scoring
    // entirely. See BUG_LEDGER — TEAM-005.
    const existingCanonical = mode === 'try-another-angle' ? result?.canonical ?? null : null

    resetResult()
    setAnalyzing(true)
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/prospect/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: rawInput,
          profileId: selectedProfileId,
          ...(existingCanonical ? { existingCanonical } : {}),
        }),
        signal: abortRef.current.signal,
      })

      await readSse<AnalyzeEvent>(res, {
        onEvent(event) {
          if (event.type === 'status') {
            setStatus(event.message)
            return
          }
          if (event.type === 'error') {
            setError(event.message)
            return
          }
          if (event.type === 'done') {
            if (!event.extracted && !event.qualification && !event.revenue) return
            setResult({
              extracted: event.extracted,
              score: event.score,
              canonical: event.canonical ?? null,
              bestSender: event.bestSender,
              bestSenderProof: event.bestSenderProof,
              connectionNote: event.connectionNote,
              charCount: event.charCount,
              maxChars: event.maxChars,
              quality: event.quality,
              strategy: event.strategy,
              alternativeSenders: event.alternativeSenders,
              draftFailed: event.draftFailed,
              demoMode: event.demoMode,
              qualification: event.qualification,
              revenue: event.revenue ?? null,
            })
            if (event.bestSender) {
              setSelectedProfileId(event.bestSender.id)
            }
          }
        },
        onError(message) {
          setError(message)
        },
      })
    } catch (err) {
      if (!error) {
        setError(err instanceof Error && err.name !== 'AbortError' ? err.message : 'Analysis failed.')
      }
    } finally {
      setAnalyzing(false)
      setStatus(null)
    }
  }

  async function copyNote() {
    if (!result?.connectionNote) return
    try {
      await navigator.clipboard.writeText(result.connectionNote)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may be unavailable
    }
  }

  async function saveAsLead(allowPotentialDuplicate = false) {
    if (saving || saveInFlightRef.current) return
    if (!result?.extracted) return
    if (!result.qualification.qualificationEligibility) {
      setError('Lead was not created: not enough context to save a reliable lead.')
      return
    }
    saveInFlightRef.current = true
    setSaving(true)
    setError(null)
    setDuplicateConflict(null)
    try {
      const res = await fetch('/api/prospect/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: result.extracted.company,
          contactName: result.extracted.name,
          contactTitle: result.extracted.title,
          titleRaw: result.extracted.titleRaw,
          locationRaw: result.extracted.locationRaw,
          aboutSummary: result.extracted.aboutSummary,
          experienceSummary: result.extracted.experienceSummary,
          recentPosts: result.extracted.recentPosts,
          roleCategory: result.extracted.roleCategory,
          marketRegion: result.extracted.marketRegion,
          extractionConfidence: result.extracted.extractionConfidence,
          confidenceNotes: result.extracted.confidenceNotes,
          url: result.extracted.url,
          signalType: result.extracted.signalType,
          signalEvidence: result.extracted.signalEvidence,
          verbatimQuote: result.extracted.verbatimQuote,
          tags: result.extracted.tags,
          senderProfileId: result.bestSender?.id ?? null,
          connectionNote: result.connectionNote,
          prospectScore: result.score?.total ?? null,
          prospectDimensions: result.score?.dimensions ?? null,
          canonical: result.canonical,
          canonicalScore: result.score?.total ?? null,
          rawInput,
          allowPotentialDuplicate,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setDuplicateConflict({
          existingLeadId:
            typeof data.existingLeadId === 'string' && data.existingLeadId.trim().length > 0
              ? data.existingLeadId
              : '',
          existingLeadCompany:
            typeof data.existingLeadCompany === 'string' && data.existingLeadCompany.trim().length > 0
              ? data.existingLeadCompany
              : 'Existing lead',
          duplicateKind: data.duplicateKind === 'potential' ? 'potential' : 'hard',
          canCreateSeparate: Boolean(data.canCreateSeparate),
          reason: typeof data.reason === 'string' ? data.reason : undefined,
        })
        return
      }
      if (!res.ok) throw new Error(data.error ?? 'Failed to save lead.')
      router.push(`/leads/${data.leadId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lead.')
    } finally {
      saveInFlightRef.current = false
      setSaving(false)
    }
  }

  function changeSender(profileId: string) {
    setSelectedProfileId(profileId)
    // Re-analyze with new sender
    if (rawInput.trim()) {
      // Small delay to let state settle
      setTimeout(() => analyze(), 50)
    }
  }

  function skip() {
    resetResult()
    setRawInput('')
    rawRef.current?.focus()
  }

  const recMeta = result?.score ? QUALIFICATION_META[result.score.qualification] ?? QUALIFICATION_META.maybe : null
  const recommendation = result
    ? result.score
      ? recMeta?.label ?? 'Awaiting analysis'
      : 'Not enough information'
    : 'Awaiting analysis'
  const canSaveLead = Boolean(result?.extracted && result.qualification.qualificationEligibility)

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Intake</p>
          <span className="size-1 rounded-full bg-line" />
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Prospect Check</p>
        </div>
        <h1 className="text-display text-[28px] font-light tracking-[-0.02em] text-ink sm:text-[32px]">
          Decide if this prospect is worth your next outreach.
        </h1>
          <p className="max-w-2xl text-[13px] text-graphite">
            Check whether a prospect is worth your next outreach.
          </p>
      </header>

      {error ? (
        <Alert variant="destructive" ref={errorRef}>
          <AlertTitle>Something failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {duplicateConflict ? (
        <Alert>
          <AlertTitle>
            {duplicateConflict.duplicateKind === 'potential'
              ? 'Potential duplicate found'
              : 'Hard duplicate blocked'}
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{duplicateConflict.reason ?? `${duplicateConflict.existingLeadCompany} already exists as a lead.`}</p>
            <div className="flex flex-wrap items-center gap-2">
              {duplicateConflict.existingLeadId ? (
                <Button variant="secondary" size="sm" onClick={() => router.push(`/leads/${duplicateConflict.existingLeadId}`)}>
                  View existing
                </Button>
              ) : null}
              {duplicateConflict.canCreateSeparate ? (
                <Button variant="outline" size="sm" onClick={() => void saveAsLead(true)} disabled={saving}>
                  Create separate
                </Button>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-lg border border-line bg-bone-raised p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-orange" aria-hidden="true" />
          <h2 className="text-sm font-medium text-ink">Paste a LinkedIn profile</h2>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-graphite">
          Name, headline, current role, company, About, experience, posts — whatever you have.
        </p>
        <Textarea
          ref={rawRef}
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              if (!analyzing) void analyze()
            }
          }}
          placeholder="Paste the LinkedIn profile here..."
          rows={10}
          className="mt-3 max-h-[24rem] overflow-y-auto font-mono text-[13px]"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-stone">Cmd / Ctrl + Enter</span>
          <div className="flex items-center gap-2">
            {result && (
              <Button variant="ghost" size="sm" onClick={skip}>
                <SkipForward className="size-3.5" aria-hidden="true" />
                Check another
              </Button>
            )}
            <Button variant="orange" onClick={() => void analyze()} loading={analyzing}>
              <Sparkles className="size-4" aria-hidden="true" />
              {analyzing ? (status ?? 'Analyzing') : result ? 'Re-analyze' : 'Analyze'}
            </Button>
          </div>
        </div>
      </div>

      {analyzing && !result && (
        <div className="flex min-h-[12rem] flex-col items-center justify-center rounded-lg border border-dashed border-line bg-bone-raised/40 px-6 text-center">
          <RefreshCw className="size-5 animate-spin text-orange" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-ink">Analyzing prospect…</p>
          <p className="mt-1 text-xs text-graphite">Usually a few seconds.</p>
        </div>
      )}

      {result && result.extracted && (
        <div className="space-y-4">
          {result.score ? (
            <div>
              <div className="flex items-baseline gap-3">
                <ScoreRing canonicalScore={result.score.total} size={64} />
                <div className="min-w-0">
                  <h2 className="text-[15px] font-medium text-ink">
                    {result.extracted.name ?? 'Unnamed prospect'}
                  </h2>
                  <p className="text-[12px] text-graphite">
                    {result.extracted.titleRaw ?? result.extracted.title ?? 'No title'} {result.extracted.company ? `· ${result.extracted.company}` : ''}
                  </p>
                </div>
                <span className={cn('ml-auto text-[11px] font-medium shrink-0', recMeta?.color)}>
                  {recMeta?.label}
                </span>
              </div>

              {result.revenue && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <SignalChip label="Fit" value={result.revenue.fit} />
                  <SignalChip label="Intent" value={result.revenue.intent} />
                  <SignalChip label="Confidence" value={result.revenue.confidence} />
                  {/* Channel-explicit: this reflects the connection-note
                      channel specifically. Lead Detail may correctly show a
                      different policy for the DM channel on the same lead —
                      not a contradiction, a different question. */}
                  <SignalChip label="Connection" value={result.revenue.messagingPolicy?.replaceAll('_', ' ') ?? '—'} />
                </div>
              )}
              {result.revenue && (
                <div className="mt-2 space-y-1">
                  <p className="text-[12px] text-ink">{result.revenue.why}</p>
                  <p className="text-[11px] text-graphite">Next: {result.revenue.nextAction}</p>
                  {!result.revenue.messageRecommended && (
                    <p className="text-[12px] font-medium text-status-warning">
                      No message recommended. {result.revenue.noMessageReason}
                    </p>
                  )}
                </div>
              )}

              {Array.isArray(result.score.reasons) && result.score.reasons.length > 0 && (
                <div className="mt-3 space-y-0.5">
                  {result.score.reasons.map((w, i) => (
                    <p key={i} className="flex items-start gap-2 text-[12px] text-ink">
                      <Check className="mt-0.5 size-3 shrink-0 text-status-success" aria-hidden="true" />
                      {w}
                    </p>
                  ))}
                </div>
              )}

              {Array.isArray(result.score.watchOut) && result.score.watchOut.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {result.score.watchOut.map((w, i) => (
                    <p key={i} className="flex items-start gap-2 text-[12px] text-graphite">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-status-warning" aria-hidden="true" />
                      {w}
                    </p>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="mt-2 flex items-center gap-1 text-[11px] text-stone transition-colors hover:text-ink"
              >
                <ChevronDown className={cn('size-3 transition-transform', showDetails && 'rotate-180')} aria-hidden="true" />
                {showDetails ? 'Hide' : 'Show'} scoring details
              </button>

              {showDetails && (
                <div className="mt-2 space-y-2 border-t border-line pt-2">
                  {result.score.dimensions.map((dim) => {
                    const frac = dim.max > 0 ? dim.points / dim.max : 0
                    return (
                      <div key={dim.label} className="space-y-0.5">
                        <div className="flex items-baseline justify-between gap-3 text-[11px]">
                          <span className="text-ink">{dim.label}</span>
                          <span className="font-mono text-stone">{dim.points}/{dim.max}</span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-line/60">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              frac >= 0.7 ? 'bg-status-success' : frac > 0.3 ? 'bg-orange' : 'bg-line',
                            )}
                            style={{ width: `${Math.max(frac * 100, frac > 0 ? 8 : 0)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-stone">{dim.note}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="border-l-2 border-status-warning/40 pl-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-status-warning">Not enough information</p>
              <p className="mt-1 text-[14px] font-medium text-ink">Relay could not verify enough evidence to score this prospect.</p>
              <p className="mt-1 text-[12px] text-graphite">Add richer person, company, and opportunity context, then analyze again.</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-graphite">
                <span>Input: {result.qualification.inputQuality}/100</span>
                <span>·</span>
                <span>Extractability: {result.qualification.extractability}/100</span>
                <span>·</span>
                <span>Evidence: {result.qualification.evidenceCoverage}/100</span>
              </div>
              {((Array.isArray(result.qualification.reasons) && result.qualification.reasons.length > 0) || (Array.isArray(result.qualification.missingCritical) && result.qualification.missingCritical.length > 0)) && (
                <ul className="mt-2 space-y-0.5">
                  {Array.isArray(result.qualification.reasons) && result.qualification.reasons.slice(0, 3).map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12px] text-graphite">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-status-warning" aria-hidden="true" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
              {Array.isArray(result.qualification.suggestions) && result.qualification.suggestions.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-graphite">
                  {result.qualification.suggestions.map((suggestion) => (
                    <li key={suggestion}>{suggestion}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result.score && result.bestSender && (
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="size-3.5 text-orange" aria-hidden="true" />
                  <h3 className="text-[12px] font-medium text-ink">Best sender: {result.bestSender.label ?? 'Unnamed'}</h3>
                </div>
                {Array.isArray(result.alternativeSenders) && result.alternativeSenders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowSenders(!showSenders)}
                    className="flex items-center gap-1 text-[11px] text-stone transition-colors hover:text-ink"
                  >
                    Change sender
                    <ChevronDown className={cn('size-3 transition-transform', showSenders && 'rotate-180')} aria-hidden="true" />
                  </button>
                )}
              </div>
              {Array.isArray(result.bestSenderProof) && result.bestSenderProof.length > 0 && (
                <p className="mt-1 text-[11px] text-graphite">
                  {result.bestSenderProof[0].safeClaim.slice(0, 100)}
                  {result.bestSenderProof.length > 1 ? ` +${result.bestSenderProof.length - 1} more` : ''}
                </p>
              )}
              {Array.isArray(result.bestSenderProof) && result.bestSenderProof.length === 0 && (
                <p className="mt-1 text-[11px] text-status-warning">
                  No verified proof matches for this sender.
                </p>
              )}

              {showSenders && Array.isArray(result.alternativeSenders) && result.alternativeSenders.length > 0 && (
                <div className="mt-2 space-y-1">
                  {result.alternativeSenders.map((alt) => (
                    <button
                      key={alt.profile.id}
                      type="button"
                      onClick={() => changeSender(alt.profile.id)}
                      className="block w-full text-left text-[11px]"
                    >
                      <span className="font-medium text-ink">{alt.profile.label ?? 'Unnamed'}</span>
                      <span className="ml-2 text-graphite">
                        {alt.topProof ?? 'No match'} · {alt.matchScore}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-medium text-ink">
                {result.revenue && !result.revenue.messageRecommended ? 'Message' : 'Connection note'}
              </h3>
              <span className={cn(
                'font-mono text-[11px]',
                result.charCount > result.maxChars ? 'text-status-danger' : 'text-stone',
              )}>
                {result.charCount} / {result.maxChars}
              </span>
            </div>
            <div className="mt-2 rounded-md bg-bone p-3">
              <p className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
                {result.connectionNote
                  || (result.revenue && !result.revenue.messageRecommended
                    ? result.revenue.noMessageReason ?? 'No message recommended.'
                    : result.score ? 'No note generated.' : 'Qualification blocked until you add enough context.')}
              </p>
            </div>

            {!result.quality.passed && Array.isArray(result.quality.failures) && result.quality.failures.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {result.quality.failures.slice(0, 3).map((f, i) => (
                  <span key={i} className="text-[10px] text-status-warning">{f}</span>
                ))}
              </div>
            )}
            {result.quality.wasRepaired && (
              <p className="mt-1 text-[10px] text-stone">Auto-repaired to meet quality standards.</p>
            )}
            {result.draftFailed && (
              <p className="mt-1 text-[10px] text-status-warning">Draft generation failed — using fallback.</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="orange" size="sm" onClick={() => void copyNote()} disabled={!result.score || !result.connectionNote}>
                {copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy note'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void analyze('try-another-angle')} disabled={analyzing}>
                <RefreshCw className="size-3" aria-hidden="true" />
                Try another angle
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void saveAsLead()} disabled={saving || !canSaveLead}>
                {saving ? 'Creating...' : (
                  <>
                    {canSaveLead ? 'Create lead' : 'Lead not eligible'}
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </>
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={skip}>
                <X className="size-3" aria-hidden="true" />
                Skip
              </Button>
            </div>

            {!canSaveLead && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-status-warning/30 bg-status-warning/5 px-3 py-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-warning" aria-hidden="true" />
                <div className="text-[12px] leading-relaxed text-graphite">
                  <p className="font-medium text-ink">
                    Not enough verified context to create a reliable lead.
                  </p>
                  {result.qualification.missingCritical.length > 0 ? (
                    <p className="mt-0.5">
                      Missing: {result.qualification.missingCritical.join(', ')}.
                    </p>
                  ) : null}
                  <p className="mt-0.5">
                    Paste more of the original source (About section, company mentions, job/opportunity details) and try again — Relay will not invent a company or opportunity that isn&apos;t actually in the text.
                  </p>
                </div>
              </div>
            )}
          </div>

          {result.demoMode && (
            <Alert>
              <AlertTitle>Demo mode</AlertTitle>
              <AlertDescription>
                Using demo extraction. Connect an AI provider in settings for full intelligence.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="h-4 lg:hidden" />
    </div>
  )
}

function SignalChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-bone-raised px-3 py-2">
      <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">{label}</p>
      <p className="mt-1 text-[14px] font-medium text-ink">{value}</p>
    </div>
  )
}

