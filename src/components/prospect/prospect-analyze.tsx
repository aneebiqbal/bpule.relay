'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Search, SkipForward, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { readSse } from '@/lib/sse/client'
import { cn } from 'cn'
import type { ExtractedLead, Profile, MatchedProof } from '@/lib/domain/types'

import type { ProspectQualificationAssessment } from '@/lib/prospect/qualification-gate'
import type { RevenueLoopSnapshot } from '@/lib/relay/revenue-strategy'
import { duplicateNotice } from '@/lib/ui/api-error-toast'
import { pasteGuard } from '@/lib/prospect/paste-guard'
import { trackEvent } from '@/lib/analytics/tracker'
import type { RejectedSignalView } from '@/components/scoring/rejected-signal-inspector'
import { useActiveIdentity } from '@/components/workspace/active-identity-provider'
import { workspaceIdentityForSender } from '@/lib/workspace/active-identity'
import {
  PROSPECT_DRAFT_KEY,
  isProspectDraftWorthSaving,
  readProspectDraft,
  serializeProspectDraft,
} from '@/lib/prospect/draft'
import { ProspectCreated, ProspectLoadingSteps, ProspectResult } from './prospect-result'
import { decisionWordFor, primaryActionFor } from '@/lib/prospect/display'

/** Canonical decision detail returned by /api/prospect/analyze (Phase 25-31). */
interface DecisionDetail {
  recommendedAction?: { action: string; reason: string; messageEligible: boolean; coldAction: string; conversationOverride: boolean; routing: { recommendation: string; reason: string | null; delta: number | null } } | null
  routingRecommendation?: { recommendation?: string; reason?: string | null; delta?: number | null; routing?: { recommendation: string; reason: string | null; delta: number | null } } | null
  confidenceDetail?: { label: 'HIGH' | 'MEDIUM' | 'LOW'; reasons: string[]; researchMore: boolean } | null
  rejectedSignals?: RejectedSignalView[]
  resolved?: { access?: string; activityRecency?: string; buyerTiming?: string; fit?: string; authority?: string; commercialPotential?: string; commercialPotentialRaw?: number; evidenceQuality?: number } | null
  versions?: { scoringVersion: string; modelVersion: string; analyzedAt: string } | null
  decisionRunId?: string | null
}

interface SenderRankView {
  senderId: string
  name: string | null
  role: string | null
  profileMatch: number
  reasons: string[]
  accessibleToRep: boolean
  primaryProof: string | null
}

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
        calculation?: unknown
        decisionAdjustments?: string[]
      } | null
      inputStatus?: 'not_prospect' | 'insufficient'
      inputHeadline?: string
      extractionCompleteness?: { score?: number; missingFields?: string[] } | null
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
      senderRouting?: { rankings?: SenderRankView[]; currentSenderId?: string | null } | null
  senderSuggestion?: { profileId: string; name: string | null; role: string | null; platform: string | null; score: number; currentBestScore: number; currentSenderName: string | null; matchedTerms: string[]; topProof: string | null; holders: string[]; reason: string } | null
      qualification: ProspectQualificationAssessment
      revenue?: RevenueLoopSnapshot
    } & DecisionDetail

export interface AnalysisState {
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
    calculation?: unknown
    decisionAdjustments?: string[]
  } | null
  /** Set when the paste could not be scored at all (no valid prospect). */
  inputStatus: 'not_prospect' | 'insufficient' | null
  inputHeadline: string | null
  extractionCompleteness: { score?: number; missingFields?: string[] } | null
  canonical: {
    extractionCompleteness?: { score?: number }
    intelligence?: { relationship?: string | null } | null
    rawSource?: { sourceType?: string | null } | null
  } | null
  bestSender: Profile | null
  bestSenderProof: MatchedProof[]
  connectionNote: string
  charCount: number
  maxChars: number
  quality: { passed: boolean; failures: string[]; wasRepaired: boolean }
  strategy: { whyConnect: string; relevantObservation: string; forbidden: string[]; candidateAngles: string[] }
  alternativeSenders: Array<{ profile: Profile; matchScore: number; topProof: string | null }>
  senderRankings: SenderRankView[]
  senderSuggestion?: { profileId: string; name: string | null; role: string | null; platform: string | null; score: number; currentBestScore: number; currentSenderName: string | null; matchedTerms: string[]; topProof: string | null; holders: string[]; reason: string } | null
  draftFailed: boolean
  demoMode: boolean
  qualification: ProspectQualificationAssessment
  revenue: RevenueLoopSnapshot | null
  decision: DecisionDetail
}

function prospectCanBeSaved(
  result: AnalysisState | null,
): result is AnalysisState & { extracted: ExtractedLead } {
  if (!result?.extracted) return false
  if (result.qualification?.inputHardFail) return false
  if (result.qualification?.qualificationEligibility) return true
  // Canonical score is the authority once a real analysis exists. The
  // no-pitch early return used to omit it, so a scored prospect rendered
  // "Lead not eligible" and the button did nothing.
  const qualification = result.score?.qualification
  if (qualification === 'strong' || qualification === 'worth_pursuing' || qualification === 'maybe') return true
  if (result.score?.label?.toLowerCase().includes('connecting')) return true
  return false
}

/**
 * Loading milestones. The SSE stream reports real stages; these labels only
 * rename them for display. An unmatched status is never invented as a step.
 */
const MILESTONE_LABELS: ReadonlyArray<{ match: RegExp; label: string }> = [
  { match: /scanning the paste/i, label: 'Reading source' },
  { match: /extracting prospect intelligence/i, label: 'Extracting identity' },
  { match: /matching sender profiles/i, label: 'Matching sender profiles' },
  { match: /drafting the connection note/i, label: 'Drafting the note' },
]

export function ProspectAnalyze() {
  const router = useRouter()
  // Read once. Recreating this every render made the draft-restore effect run on
  // every commit, and JSON.parse returns a fresh object each time, so setResult
  // scheduled another render forever — the page froze after an analysis and only
  // the browser Back button responded.
  const searchParams = useMemo(
    () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null),
    [],
  )
  const errorRef = useRef<HTMLDivElement | null>(null)
  const [rawInput, setRawInput] = useState(() => {
    const paste = searchParams?.get('paste')
    if (!paste) return ''
    try {
      return decodeURIComponent(paste)
    } catch {
      // URI malformed — paste contains raw % chars from LinkedIn data
      return paste
    }
  })
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Field-level problem with the paste itself — shown once, next to the
  // textarea, never as a "Something failed" banner or a toast.
  const [validationError, setValidationError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisState | null>(null)
  const [saving, setSaving] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [showSource, setShowSource] = useState(false)
  /** Milestones the SSE stream actually reported, in order. */
  const [steps, setSteps] = useState<string[]>([])
  const [profiles, setProfiles] = useState<Array<{ id: string; label: string }>>([])
  const [createdLead, setCreatedLead] = useState<{ id: string; company: string | null } | null>(null)
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
  // Rapid-click guard: a state flag flips a render later, so two clicks in the
  // same tick could both start an analysis (QA BUG-13-02).
  const analyzingRef = useRef(false)
  const workspace = useActiveIdentity()
  const seenWorkspaceId = useRef<string | null | undefined>(undefined)

  // Preserve sender preference across re-analyses. The sidebar workspace
  // is the default sender; changing sender here is only for this check.
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)

  // Resilient workspace: the draft and the last completed result survive a
  // refresh, back/forward and navigation away (QA BUG-13-01). Explicit Clear
  // removes it; privacy stays local to this browser. A successful save removes
  // it too — a completed analysis must not come back (BUG-23).
  const DRAFT_KEY = PROSPECT_DRAFT_KEY
  const [draftRestored, setDraftRestored] = useState(false)
  const restoredOnce = useRef(false)
  useEffect(() => {
    // Restore exactly once. Re-running this would set a freshly-parsed result
    // object on every render and loop forever.
    if (restoredOnce.current) return
    restoredOnce.current = true
    if (searchParams?.get('paste')) { setDraftRestored(true); return }
    const parsed = readProspectDraft(localStorage.getItem(DRAFT_KEY))
    if (parsed?.rawInput) setRawInput(parsed.rawInput)
    if (parsed?.result) setResult(parsed.result as AnalysisState)
    setDraftRestored(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!draftRestored) return
    if (!isProspectDraftWorthSaving({ rawInput, result })) return
    try {
      localStorage.setItem(DRAFT_KEY, serializeProspectDraft({ rawInput, result }))
    } catch { /* quota or unavailable — never block the analysis */ }
  }, [rawInput, result, draftRestored, DRAFT_KEY])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  // Auto-analyze if paste param provided
  useEffect(() => {
    const paste = searchParams?.get('paste')
    if (paste && !analyzing && !result) {
      void analyze()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Clicking "Create lead" happens near the bottom of a long results panel,
  // but the error banner renders at the top of the page — without this, a
  // failed save looks like the button did nothing (TEAM-002 / relay.bpulse.dev report).
  useEffect(() => {
    if (error || duplicateConflict) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error, duplicateConflict])

  const resetResult = useCallback(() => {
    setResult(null)
    setError(null)
    setSteps([])
    setShowDetails(false)
    setShowSource(false)
    setDuplicateConflict(null)
  }, [])

  useEffect(() => {
    const nextId = workspace.active?.id ?? null
    const nextProfileId = workspace.active?.profileId ?? null
    if (seenWorkspaceId.current === undefined) {
      seenWorkspaceId.current = nextId
      setSelectedProfileId(nextProfileId)
      return
    }
    if (seenWorkspaceId.current === nextId) return
    seenWorkspaceId.current = nextId
    setSelectedProfileId(nextProfileId)
    resetResult()
  }, [workspace.active?.id, workspace.active?.profileId, resetResult])

  // The sender list backs the "Working as" selector. Best-effort: without it
  // the selector falls back to the active workspace identity.
  useEffect(() => {
    let cancelled = false
    fetch('/api/profiles')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.profiles)) return
        setProfiles(
          (data.profiles as Array<{ id?: unknown; label?: unknown; displayName?: unknown }>)
            .map((profile) => ({
              id: typeof profile.id === 'string' ? profile.id : '',
              label:
                typeof profile.label === 'string'
                  ? profile.label
                  : typeof profile.displayName === 'string'
                    ? profile.displayName
                    : 'Profile',
            }))
            .filter((profile) => profile.id.length > 0),
        )
      })
      .catch(() => { /* sender list is optional */ })
    return () => { cancelled = true }
  }, [])

  async function analyze(mode: 'analyze' | 'try-another-angle' | 'generate' = 'analyze', profileIdOverride?: string) {
    if (analyzingRef.current) return
    const guard = pasteGuard(rawInput)
    if (guard) {
      setValidationError(guard)
      rawRef.current?.focus()
      return
    }
    setValidationError(null)
    analyzingRef.current = true

    // "Try Another Angle" must never re-derive canonical evidence/score/
    // qualification/action — only a new message angle. Capture the
    // ALREADY-HELD canonical result before resetResult() clears it, and
    // valid for this exact input and skip re-extraction/re-scoring
    // entirely. See BUG_LEDGER — TEAM-005.
    const existingCanonical = mode === 'try-another-angle' ? result?.canonical ?? null : null

    const effectiveProfileId = profileIdOverride ?? selectedProfileId ?? workspace.active?.profileId ?? null
    const revenueIdentityId = workspaceIdentityForSender(workspace.active, effectiveProfileId)

    resetResult()
    setAnalyzing(true)
    abortRef.current = new AbortController()
    const analysisTiming = performance.now()
    trackEvent({ event: 'prospect_analysis_started' })

    try {
      const res = await fetch('/api/prospect/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: rawInput,
          profileId: effectiveProfileId,
          revenueIdentityId,
          generateNote: mode === 'generate',
          ...(existingCanonical ? { existingCanonical } : {}),
        }),
        signal: abortRef.current.signal,
      })

      // One presenter for server errors: the banner. readSse stays silent.
      await readSse<AnalyzeEvent>(res, {
        silent: true,
        onEvent(event) {
          if (event.type === 'status') {
            setSteps((prev) => {
              const milestone = MILESTONE_LABELS.find((entry) => entry.match.test(event.message))
              if (!milestone || prev.includes(milestone.label)) return prev
              return [...prev, milestone.label]
            })
            return
          }
          if (event.type === 'error') {
            setError(event.message)
            return
          }
          if (event.type === 'done') {
            if (!event.extracted && !event.qualification && !event.revenue) return
            // BUG-17: wrap in try/catch so a malformed done event surfaces as a
            // user-facing error instead of crashing into the route error boundary.
            try {
              setResult({
                extracted: event.extracted,
                score: event.score,
                canonical: event.canonical ?? null,
                bestSender: event.bestSender,
                bestSenderProof: event.bestSenderProof,
                connectionNote: event.connectionNote,
                charCount: event.charCount,
                maxChars: event.maxChars,
                quality: event.quality ?? { passed: true, failures: [], wasRepaired: false },
                strategy: event.strategy,
                alternativeSenders: event.alternativeSenders,
                senderRankings: (() => {
                  const all = Array.isArray(event.senderRouting?.rankings) ? event.senderRouting.rankings : []
                  const currentId = event.senderRouting?.currentSenderId ?? event.bestSender?.id ?? null
                  const top = all.slice(0, 5)
                  const current = currentId ? all.find((ranking) => ranking.senderId === currentId) : undefined
                  if (current && !top.some((ranking) => ranking.senderId === current.senderId)) return [...top, current]
                  return top
                })(),
                senderSuggestion: event.senderSuggestion ?? null,
                draftFailed: event.draftFailed,
                demoMode: event.demoMode,
                qualification: event.qualification,
                revenue: event.revenue ?? null,
                inputStatus: event.inputStatus ?? null,
                inputHeadline: event.inputHeadline ?? null,
                extractionCompleteness: event.extractionCompleteness ?? null,
                decision: {
                  recommendedAction: event.recommendedAction ?? null,
                  routingRecommendation: event.routingRecommendation ?? null,
                  confidenceDetail: event.confidenceDetail ?? null,
                  rejectedSignals: Array.isArray(event.rejectedSignals) ? event.rejectedSignals : [],
                  resolved: event.resolved ?? null,
                  versions: event.versions ?? null,
                  decisionRunId: event.decisionRunId ?? null,
                },
              })
              // Track completed analysis
              const durationMs = Math.round(performance.now() - analysisTiming)
              trackEvent({
                event: 'prospect_analysis_completed',
                durationMs,
                metadata: { qualification: event.score?.qualification ?? '', score: event.score?.total ?? 0 },
              })
            } catch (doneErr) {
              setError(doneErr instanceof Error ? doneErr.message : 'Analysis result could not be rendered.')
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
      analyzingRef.current = false
      setAnalyzing(false)
    }
  }

  async function saveAsLead(allowPotentialDuplicate = false) {
    if (saving || saveInFlightRef.current) return
    if (!prospectCanBeSaved(result)) {
      const message = 'Lead was not created: not enough context to save a reliable lead.'
      setError(message)
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
          senderProfileId: selectedProfileId ?? result.bestSender?.id ?? workspace.active?.profileId ?? null,
          revenueIdentityId: workspaceIdentityForSender(
            workspace.active,
            selectedProfileId ?? result.bestSender?.id ?? workspace.active?.profileId ?? null,
          ),
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
      // Clear the one-shot prospect state only AFTER the server confirmed the
      // lead. Clearing before the response would leave nothing to show if the
      // save failed; never clearing left the completed analysis — and its live
      // "Create lead" CTA — in localStorage, so returning to Prospect resurrected
      // it and allowed a second save (BUG-23).
      const company = result.extracted.company
      resetResult()
      setRawInput('')
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      trackEvent({ event: 'lead_saved', leadId: data.leadId })
      // Stay on the page with an explicit confirmation instead of redirecting:
      // the result is gone and the primary CTA can never be fired twice.
      setCreatedLead({ id: data.leadId, company })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save lead.'
      setError(message)
    } finally {
      saveInFlightRef.current = false
      setSaving(false)
    }
  }

  function changeSender(profileId: string) {
    setSelectedProfileId(profileId)
    if (rawInput.trim()) {
      setTimeout(() => analyze('analyze', profileId), 50)
    }
  }

  function skip() {
    resetResult()
    setRawInput('')
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    rawRef.current?.focus()
  }

  function openCreatedLead() {
    if (!createdLead) return
    router.push(`/leads/${createdLead.id}?next=generate-connection`)
  }

  function resetAfterCreate() {
    setCreatedLead(null)
    rawRef.current?.focus()
  }

  /** One primary action, chosen by the canonical decision. */
  function handlePrimaryAction() {
    if (!result) return
    const word = decisionWordFor(result.decision?.recommendedAction?.action ?? null, result.score?.qualification)
    const action = primaryActionFor(word)
    if (action.kind === 'dismiss') {
      skip()
      return
    }
    void saveAsLead()
  }

  const canSaveLead = prospectCanBeSaved(result)
  const duplicateCopy = duplicateConflict ? duplicateNotice(duplicateConflict) : null
  const profileName =
    profiles.find((profile) => profile.id === (selectedProfileId ?? workspace.active?.profileId))?.label
    ?? workspace.active?.identityName
    ?? null

  return (
    <div className="space-y-5">
      {/* The workspace supplies the page header; this line is the profile
          attribution (BUG-24/29/30) and must stay visible. */}
      {workspace.active ? (
        <p className="text-[13px] text-ink">
          Prospecting as <span className="font-medium">{workspace.active.identityName}</span>
          {workspace.active.title ? <span className="text-graphite"> · {workspace.active.title}</span> : null}
        </p>
      ) : null}

      {error ? (
        <Alert variant="destructive" ref={errorRef}>
          <AlertTitle>Something failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {duplicateConflict && duplicateCopy ? (
        <Alert ref={error ? undefined : errorRef}>
          <AlertTitle>{duplicateCopy.title}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{duplicateCopy.description}</p>
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

      <div className="srf-console p-4 sm:p-5">
        <label htmlFor="prospect-source" className="flex items-center gap-2 text-sm font-medium text-[color:var(--console-text)]">
          <Search className="size-4 text-orange" aria-hidden="true" />
          Paste a LinkedIn profile
        </label>
        <p className="mt-1 text-xs leading-relaxed text-[color:var(--console-mute)]">
          Name, headline, current role, company, About, experience, posts — whatever you have.
        </p>
        <Textarea
          id="prospect-source"
          ref={rawRef}
          value={rawInput}
          aria-invalid={validationError ? true : undefined}
          aria-describedby={validationError ? 'prospect-paste-error' : undefined}
          onChange={(e) => {
            setRawInput(e.target.value)
            if (validationError) setValidationError(null)
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              if (!analyzing) void analyze()
            }
          }}
          placeholder="Paste the LinkedIn profile here..."
          rows={10}
          className={cn(
            'mt-3 max-h-[24rem] overflow-y-auto font-mono text-[13px]',
            validationError && 'border-status-danger focus-visible:ring-status-danger/30',
          )}
        />
        {validationError ? (
          <p id="prospect-paste-error" role="alert" className="mt-1.5 flex items-center gap-1.5 text-[12px] text-status-danger">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
            {validationError}
          </p>
        ) : null}

        <div className="mt-4 border-t border-[color:var(--console-line)] pt-3">
          <label
            htmlFor="prospect-sender"
            className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-[color:var(--console-mute)]"
          >
            Working as
          </label>
          <Select
            id="prospect-sender"
            className="mt-1.5 h-9 text-[13px] border-[color:var(--console-line)] bg-[color:var(--console-raised)] text-[color:var(--console-text)]"
            value={selectedProfileId ?? workspace.active?.profileId ?? ''}
            onChange={(e) => changeSender(e.target.value)}
            disabled={profiles.length === 0}
          >
            {profiles.length === 0 ? (
              <option value={workspace.active?.profileId ?? ''}>
                {workspace.active?.identityName ?? 'No profile assigned'}
              </option>
            ) : (
              profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.label}</option>
              ))
            )}
          </Select>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          {/* Keyboard hint is for desktop; touch layouts rely on the Analyze button. */}
          <span className="hidden text-xs text-stone sm:inline">Cmd / Ctrl + Enter</span>
          <span className="sm:hidden" aria-hidden="true" />
          <div className="flex items-center gap-2">
            {result && !createdLead ? (
              <Button variant="ghost" size="sm" onClick={skip}>
                <SkipForward className="size-3.5" aria-hidden="true" />
                Check another
              </Button>
            ) : null}
            <Button variant="orange" onClick={() => void analyze()} loading={analyzing}>
              <Sparkles className="size-4" aria-hidden="true" />
              {analyzing ? 'Analyzing' : result ? 'Re-analyze' : 'Analyze'}
            </Button>
          </div>
        </div>
      </div>

      {analyzing && !result ? (
        <ProspectLoadingSteps steps={steps} current={Math.max(0, steps.length - 1)} />
      ) : null}

      {createdLead ? (
        <ProspectCreated
          leadId={createdLead.id}
          company={createdLead.company}
          onOpen={openCreatedLead}
          onReset={resetAfterCreate}
        />
      ) : null}

      {result && result.extracted && !createdLead ? (
        <ProspectResult
          result={result}
          profileName={profileName}
          rawInput={rawInput}
          canSaveLead={canSaveLead}
          showDetails={showDetails}
          showSource={showSource}
          activeSenderId={selectedProfileId ?? result.bestSender?.id ?? null}
          onPrimaryAction={handlePrimaryAction}
          onReanalyze={() => void analyze('analyze')}
          onTryAnotherAngle={() => void analyze('analyze')}
          onToggleDetails={() => setShowDetails((value) => !value)}
          onToggleSource={() => setShowSource((value) => !value)}
          onSenderChange={changeSender}
        />
      ) : null}

      {result?.demoMode && !createdLead ? (
        <Alert>
          <AlertTitle>Demo mode</AlertTitle>
          <AlertDescription>
            Using demo extraction. Connect an AI provider in settings for full intelligence.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="h-4 lg:hidden" />
    </div>
  )
}
