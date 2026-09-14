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
import { readSse } from '@/lib/sse/client'
import { cn } from 'cn'
import type { ExtractedLead, Profile, MatchedProof } from '@/lib/domain/types'
import type { ProspectScore, Recommendation } from '@/lib/prospect/intelligence'

type AnalyzeEvent =
  | { type: 'status'; message: string }
  | { type: 'error'; message: string }
  | {
      type: 'done'
      extracted: ExtractedLead
      score: ProspectScore
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
    }

interface AnalysisState {
  extracted: ExtractedLead | null
  score: ProspectScore | null
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
}

const RECOMMENDATION_META: Record<Recommendation, { label: string; color: string; bg: string }> = {
  connect: { label: 'Strong prospect', color: 'text-status-success', bg: 'bg-status-success/10' },
  maybe: { label: 'Worth considering', color: 'text-orange', bg: 'bg-orange/10' },
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
  const [rawInput, setRawInput] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisState | null>(null)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [showSenders, setShowSenders] = useState(false)
  const rawRef = useRef<HTMLTextAreaElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Preserve sender preference across re-analyses
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const resetResult = useCallback(() => {
    setResult(null)
    setError(null)
    setStatus(null)
    setCopied(false)
    setShowDetails(false)
    setShowSenders(false)
  }, [])

  async function analyze() {
    const guard = pasteGuard(rawInput)
    if (guard) {
      setError(guard)
      rawRef.current?.focus()
      return
    }

    resetResult()
    setAnalyzing(true)
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/prospect/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: rawInput, profileId: selectedProfileId }),
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
            setResult({
              extracted: event.extracted,
              score: event.score,
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

  async function saveAsLead() {
    if (!result?.extracted) return
    setSaving(true)
    setError(null)
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
        }),
      })
      const data = await res.json()
      if (res.status === 409) {
        if (data.existingLeadId) {
          setError(`This company already exists as a lead (${data.existingLeadCompany}).`)
          // Could offer navigation
        } else {
          setError(data.reason ?? 'Duplicate blocked.')
        }
        return
      }
      if (!res.ok) throw new Error(data.error ?? 'Failed to save lead.')
      router.push(`/leads/${data.leadId}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lead.')
    } finally {
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

  const recMeta = result?.score ? RECOMMENDATION_META[result.score.recommendation] : null

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">Prospect Check</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate">
            Paste a LinkedIn profile. Relay will tell you if they are worth pursuing and draft the connection note.
          </p>
        </div>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* ── Input area ── */}
      <div className="rounded-2xl border border-line bg-paper p-5">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-orange" aria-hidden="true" />
          <h2 className="text-sm font-medium text-ink">Paste a LinkedIn profile</h2>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate">
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
          <span className="text-xs text-slate">Cmd / Ctrl + Enter</span>
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

      {/* ── Loading state ── */}
      {analyzing && !result && (
        <div className="flex min-h-[12rem] flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 text-center">
          <RefreshCw className="size-5 animate-spin text-orange" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-ink">{status ?? 'Analyzing...'}</p>
          <p className="mt-1 text-xs text-slate">This usually takes a few seconds.</p>
        </div>
      )}

      {/* ── Results ── */}
      {result && result.score && result.extracted && (
        <div className="space-y-5">
          {/* Score + recommendation */}
          <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <ProspectScoreRing score={result.score.total} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-medium text-ink">
                      {result.extracted.name ?? 'Unnamed prospect'}
                    </span>
                  </div>
                  <p className="text-[13px] text-graphite">
                    {result.extracted.titleRaw ?? result.extracted.title ?? 'No title'} {result.extracted.company ? `· ${result.extracted.company}` : ''}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={cn('rounded px-2 py-0.5 text-[11px] font-medium', recMeta?.bg, recMeta?.color)}>
                      {recMeta?.label}
                    </span>
                    <span className="text-[12px] text-stone">
                      {result.score.evidenceConfidence}/100 evidence confidence
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Why */}
            {result.score.why.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-stone">Why</p>
                <ul className="space-y-1">
                  {result.score.why.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-ink">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-status-success" aria-hidden="true" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Watch out */}
            {result.score.watchOut.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-stone">Watch out</p>
                <ul className="space-y-1">
                  {result.score.watchOut.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-graphite">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-warning" aria-hidden="true" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Expandable details */}
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="mt-3 flex items-center gap-1 text-[12px] text-stone hover:text-ink"
            >
              <ChevronDown className={cn('size-3.5 transition-transform', showDetails && 'rotate-180')} aria-hidden="true" />
              {showDetails ? 'Hide' : 'Show'} scoring details
            </button>

            {showDetails && (
              <div className="mt-3 space-y-2 border-t border-line pt-3">
                {result.score.dimensions.map((dim) => {
                  const frac = dim.max > 0 ? dim.points / dim.max : 0
                  return (
                    <div key={dim.key} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-[12px]">
                        <span className="text-ink">{dim.label}</span>
                        <span className="font-mono text-[11px] text-stone">{dim.points}/{dim.max}</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-bone">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            frac >= 0.7 ? 'bg-status-success' : frac > 0.3 ? 'bg-orange' : 'bg-line',
                          )}
                          style={{ width: `${Math.max(frac * 100, frac > 0 ? 8 : 0)}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-stone">{dim.note}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Best sender */}
          {result.bestSender && (
            <div className="rounded-2xl border border-line bg-paper p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="size-4 text-orange" aria-hidden="true" />
                  <h3 className="text-sm font-medium text-ink">Best sender: {result.bestSender.label ?? 'Unnamed'}</h3>
                </div>
                {result.alternativeSenders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowSenders(!showSenders)}
                    className="flex items-center gap-1 text-[12px] text-stone hover:text-ink"
                  >
                    Change sender
                    <ChevronDown className={cn('size-3.5 transition-transform', showSenders && 'rotate-180')} aria-hidden="true" />
                  </button>
                )}
              </div>
              {result.bestSenderProof.length > 0 && (
                <p className="mt-1.5 text-[12px] text-graphite">
                  {result.bestSenderProof[0].safeClaim.slice(0, 100)}
                  {result.bestSenderProof.length > 1 ? ` +${result.bestSenderProof.length - 1} more` : ''}
                </p>
              )}
              {result.bestSenderProof.length === 0 && (
                <p className="mt-1.5 text-[12px] text-status-warning">
                  No verified proof matches for this sender — note may lack credibility.
                </p>
              )}

              {showSenders && result.alternativeSenders.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  {result.alternativeSenders.map((alt) => (
                    <button
                      key={alt.profile.id}
                      type="button"
                      onClick={() => changeSender(alt.profile.id)}
                      className="block w-full rounded-lg border border-line bg-bone/40 px-3 py-2 text-left text-xs transition-colors hover:bg-bone"
                    >
                      <span className="block font-medium text-ink">{alt.profile.label ?? 'Unnamed'}</span>
                      <span className="mt-0.5 block text-slate">
                        {alt.topProof ?? 'No direct proof match'} · score {alt.matchScore}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Connection note */}
          <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-ink">Connection note</h3>
              <span className={cn(
                'font-mono text-[12px]',
                result.charCount > result.maxChars ? 'text-status-danger' : 'text-stone',
              )}>
                {result.charCount} / {result.maxChars}
              </span>
            </div>
            <div className="mt-3 rounded-lg border border-line bg-bone/40 p-4">
              <p className="text-[14px] leading-relaxed text-ink whitespace-pre-wrap">
                {result.connectionNote || 'No note generated.'}
              </p>
            </div>

            {/* Quality indicators */}
            {!result.quality.passed && result.quality.failures.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {result.quality.failures.slice(0, 3).map((f, i) => (
                  <span key={i} className="rounded bg-status-warning/10 px-1.5 py-0.5 text-[10px] text-status-warning">
                    {f}
                  </span>
                ))}
              </div>
            )}
            {result.quality.wasRepaired && (
              <p className="mt-1.5 text-[11px] text-stone">Auto-repaired to meet quality standards.</p>
            )}
            {result.draftFailed && (
              <p className="mt-1.5 text-[11px] text-status-warning">Draft generation failed — using fallback.</p>
            )}

            {/* Actions */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="orange" size="sm" onClick={() => void copyNote()}>
                {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy note'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void analyze()} disabled={analyzing}>
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Try another angle
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void saveAsLead()} disabled={saving}>
                {saving ? 'Saving...' : (
                  <>
                    Save as lead
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </>
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={skip}>
                <X className="size-3.5" aria-hidden="true" />
                Skip
              </Button>
            </div>
          </div>

          {/* Demo mode notice */}
          {result.demoMode && (
            <Alert>
              <AlertTitle>Demo mode</AlertTitle>
              <AlertDescription>
                No AI provider configured. Using deterministic demo extraction and a template note.
                Set GROQ_API_KEY for full intelligence.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Mobile spacer */}
      <div className="h-4 lg:hidden" />
    </div>
  )
}

function ProspectScoreRing({ score }: { score: number }) {
  const size = 64
  const max = 100
  const pct = Math.min(Math.max(score, 0) / max, 1)
  const strokeWidth = 5
  const r = (size - strokeWidth * 2) / 2
  const c = 2 * Math.PI * r
  const color =
    pct >= 0.7
      ? 'var(--status-success)'
      : pct >= 0.55
        ? 'var(--orange)'
        : 'var(--graphite)'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={strokeWidth}
          opacity={0.3}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-mono-medium text-[16px] font-medium leading-none text-ink">
          {score}
        </span>
      </div>
    </div>
  )
}
