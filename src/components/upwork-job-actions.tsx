'use client'

/**
 * Upwork proposal workspace — the action surface on a job.
 *
 * Generate from a sending profile, edit, persist screening answers, then
 * confirm the application with the real connects spent. A generated proposal
 * is never an application; only the confirmation creates one.
 */
import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Copy, RefreshCw, Sparkles, UserPlus, AlertTriangle, Archive, Trash2 } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from 'cn'
import type { ProofItem, UpworkApplication, UpworkScreeningAnswer } from '@/lib/domain/types'
import { responseTimeMs } from '@/lib/upwork/lifecycle'

export interface ProposalProfileOption {
  id: string
  name: string
  channels: string[]
}

interface UpworkJobActionsProps {
  jobId: string
  jobTitle: string
  jobScore: number | null
  jobStatus: string
  connectsCost: number
  profiles: ProposalProfileOption[]
  matchedProofs: ProofItem[]
  /** Latest persisted proposal version, so a draft survives a reload. */
  savedDraft?: string | null
  /** Screening answers persisted with the latest proposal version. */
  savedScreeningAnswers?: UpworkScreeningAnswer[]
  /** The submitted application, when one exists. */
  application?: UpworkApplication | null
  isAdmin?: boolean
  reps?: Array<{ id: string; name: string }>
  actingRepId?: string | null
  profilesLoadFailed?: boolean
}

const MIN_SCORE_TO_APPLY = 6

function formatResponseTime(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  const days = Math.floor(minutes / (60 * 24))
  const hours = Math.floor((minutes % (60 * 24)) / 60)
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return `${hours}h`
  return `${minutes}m`
}

function markAppliedButtonClass(applied: boolean, belowGate: boolean): string {
  if (applied) return 'bg-status-success/10 text-status-success'
  if (belowGate) return 'bg-status-success/40 text-on-success cursor-not-allowed opacity-60'
  return 'bg-status-success text-on-success hover:bg-status-success/90'
}

function channelLabel(channels: string[]): string {
  return channels.map((channel) => channel.toUpperCase()).join(' · ')
}

export function UpworkJobActions({
  jobId,
  jobTitle,
  jobScore,
  jobStatus,
  connectsCost,
  profiles,
  matchedProofs,
  savedDraft,
  savedScreeningAnswers = [],
  application = null,
  isAdmin = false,
  reps = [],
  actingRepId = null,
  profilesLoadFailed = false,
}: UpworkJobActionsProps) {
  const router = useRouter()
  const belowGate = jobScore === null || jobScore < MIN_SCORE_TO_APPLY
  const eligibility = (() => {
    if (profilesLoadFailed) return { ok: false, reason: 'Profiles could not be loaded. Retry.' }
    if (profiles.length === 0) return { ok: false, reason: 'Assign an Upwork profile first.' }
    if (jobScore === null) return { ok: false, reason: 'Analyze this job before generating a proposal.' }
    return { ok: true as const, reason: null as string | null }
  })()
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const activeProfileId = profiles.some((option) => option.id === selectedProfileId)
    ? selectedProfileId
    : (profiles[0]?.id ?? '')
  const [proposal, setProposal] = useState(savedDraft ?? '')
  const [screeningAnswers, setScreeningAnswers] = useState<UpworkScreeningAnswer[]>(savedScreeningAnswers)
  const [generating, setGenerating] = useState(false)
  const canGenerate = eligibility.ok && !generating
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [readiness, setReadiness] = useState<{ status: 'ready' | 'needs_review'; reasons: string[] } | null>(null)
  const [evidenceUsed, setEvidenceUsed] = useState<Array<{ id: string; kind: string; title: string; url: string | null }>>([])
  const [jobSignals, setJobSignals] = useState<string[]>([])
  const [unsupportedClaims, setUnsupportedClaims] = useState<string[]>([])
  const [generationMode, setGenerationMode] = useState<'standard' | 'premium'>('standard')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const saveInFlightRef = useRef(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [connectsSpent, setConnectsSpent] = useState<string>(String(connectsCost || ''))
  const [boostConnects, setBoostConnects] = useState('0')
  const [submitting, setSubmitting] = useState(false)
  const [busy, setBusy] = useState(false)
  const proofHint = matchedProofs[0]?.projectSummary ?? null
  const actingRep = reps.find((rep) => rep.id === actingRepId) ?? null

  const generate = useCallback(async () => {
    if (!activeProfileId) {
      setError('Select a profile first.')
      return
    }
    setGenerating(true)
    setError(null)
    setReadiness(null)
    setEvidenceUsed([])
    setUnsupportedClaims([])
    setProposal('')
    try {
      const res = await fetch(`/api/upwork/jobs/${jobId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: activeProfileId, generationMode, repId: actingRepId ?? undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Generation failed.')
      }
      const data = await res.json()
      setProposal(data.draft.text)
      setReadiness(data.draft.readiness ?? null)
      setScreeningAnswers(data.draft.questionAnswers ?? [])
      setEvidenceUsed(data.draft.evidenceUsed ?? [])
      setJobSignals(data.draft.jobSignals ?? [])
      setUnsupportedClaims(data.draft.unsupportedClaims ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setGenerating(false)
    }
  }, [jobId, activeProfileId, generationMode, actingRepId])

  const copyProposal = useCallback(async () => {
    if (!proposal) return
    try {
      await navigator.clipboard.writeText(proposal)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* no-op */ }
  }, [proposal])

  const saveDraft = useCallback(async () => {
    if (!proposal.trim()) return
    if (saveInFlightRef.current) return
    saveInFlightRef.current = true
    setSaveState('saving')
    setError(null)
    try {
      const res = await fetch(`/api/upwork/jobs/${jobId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalText: proposal.trim(),
          screeningAnswers,
          modelTier: generationMode,
          profileId: activeProfileId || undefined,
          repId: actingRepId ?? undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to save draft.')
      }
      setSaveState('saved')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
      setSaveState('failed')
    } finally {
      saveInFlightRef.current = false
    }
  }, [jobId, proposal, screeningAnswers, generationMode, activeProfileId, actingRepId, router])

  const confirmApplication = useCallback(async () => {
    if (!proposal.trim()) {
      setError('Generate a proposal before confirming the application.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/upwork/jobs/${jobId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalText: proposal.trim(),
          screeningAnswers,
          connectsSpent: connectsSpent ? Number(connectsSpent) : null,
          boostConnects: boostConnects ? Number(boostConnects) : 0,
          modelTier: generationMode,
          profileId: activeProfileId || undefined,
          repId: actingRepId ?? undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to submit the application.')
      }
      setConfirmOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit the application.')
    } finally {
      setSubmitting(false)
    }
  }, [jobId, proposal, screeningAnswers, connectsSpent, boostConnects, generationMode, activeProfileId, actingRepId, router])

  const followUp = useCallback(async () => {
    const text = window.prompt('Follow-up message (sent on Upwork):')
    if (!text?.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/upwork/jobs/${jobId}/followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), repId: actingRepId ?? undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to log the follow-up.')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log the follow-up.')
    } finally {
      setBusy(false)
    }
  }, [jobId, actingRepId, router])

  const archive = useCallback(async () => {
    if (!window.confirm('Archive this job? The history is preserved.')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/upwork/jobs/${jobId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId: actingRepId ?? undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to archive.')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive.')
    } finally {
      setBusy(false)
    }
  }, [jobId, actingRepId, router])

  const remove = useCallback(async () => {
    if (!window.confirm('Delete this saved job? This permanently removes it.')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/upwork/jobs/${jobId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to delete.')
      }
      router.push('/upwork')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.')
      setBusy(false)
    }
  }, [jobId, router])

  const canDelete = !application && (jobStatus === 'SAVED' || jobStatus === 'DRAFT_READY')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone">Proposal workspace</p>
          <p className="mt-1 text-[13px] text-graphite">
            {application
              ? `Application submitted ${application.submittedAt ? new Date(application.submittedAt).toLocaleString() : ''}.`
              : 'Generate from a sending profile, then edit and confirm after human review.'}
          </p>
          {proofHint && <p className="mt-1 text-[12px] text-ink">Relevant proof: {proofHint}</p>}
        </div>
        {jobScore != null && (
          <div className="text-right">
            <p className="text-[11px] text-stone">Job score</p>
            <p className={cn('text-[20px] font-medium tabular-nums', belowGate ? 'text-status-warning' : 'text-status-success')}>
              {jobScore}/10
            </p>
          </div>
        )}
      </div>

      {isAdmin && reps.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-bone px-4 py-3 ring-1 ring-line">
          <label className="text-[12px] font-medium text-graphite" htmlFor="upwork-acting-rep">Acting as</label>
          <select
            id="upwork-acting-rep"
            value={actingRepId ?? ''}
            onChange={(e) => router.push(e.target.value ? `/upwork/${jobId}?repId=${e.target.value}` : `/upwork/${jobId}`)}
            className="rounded-lg border border-line bg-bone-raised px-3 py-1.5 text-[13px] text-ink"
          >
            {reps.map((rep) => (
              <option key={rep.id} value={rep.id}>{rep.name}</option>
            ))}
          </select>
          {actingRep && <span className="text-[12px] text-stone">{actingRep.name}&apos;s profiles</span>}
        </div>
      )}

      {profilesLoadFailed ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-status-danger/30 bg-status-danger/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-status-danger/10 ring-1 ring-status-danger/20">
              <AlertTriangle className="size-4 text-status-danger" aria-hidden />
            </span>
            <div>
              <p className="text-[13px] font-medium text-ink">Profiles could not be loaded</p>
              <p className="mt-0.5 text-[12px] text-graphite">This is a data problem, not an empty assignment. Retry — nothing was sent.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:bg-bone hover:text-ink"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Retry
          </button>
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-bone px-4 py-4 ring-1 ring-line sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-orange-faint ring-1 ring-orange/20">
              <UserPlus className="size-4 text-orange" aria-hidden />
            </span>
            <div>
              <p className="text-[13px] font-medium text-ink">No Upwork profile assigned</p>
              <p className="mt-0.5 text-[12px] text-graphite">
                {isAdmin
                  ? 'Assign an Upwork-enabled profile to a rep, or configure one from the profile directory.'
                  : 'You need an Upwork-enabled profile before Relay can generate proposals.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin ? (
              <>
                <Link href="/team/profiles" className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98]">
                  Assign profile
                </Link>
                <Link href="/team/profiles?add=1" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:bg-bone hover:text-ink">
                  Create / configure profile
                </Link>
              </>
            ) : (
              <Link href="/rep/assigned-profiles" className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98]">
                View my profiles
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-bone px-4 py-3 ring-1 ring-line">
          <label className="text-[12px] font-medium text-graphite" htmlFor="upwork-proposal-profile">Proposal profile</label>
          <select
            id="upwork-proposal-profile"
            value={activeProfileId}
            onChange={(e) => setSelectedProfileId(e.target.value)}
            className="rounded-lg border border-line bg-bone-raised px-3 py-1.5 text-[13px] text-ink"
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name} · {channelLabel(profile.channels)}
              </option>
            ))}
          </select>
          {!application && (
            <button
              type="button"
              onClick={() => setGenerationMode(generationMode === 'standard' ? 'premium' : 'standard')}
              aria-pressed={generationMode === 'premium'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors',
                generationMode === 'premium' ? 'border-cobalt/30 bg-cobalt/10 text-cobalt-ink' : 'border-line text-graphite hover:bg-bone-raised hover:text-ink',
              )}
            >
              {generationMode === 'premium' ? '★ Premium' : 'Standard'}
            </button>
          )}
        </div>
      )}

      {!application && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={!canGenerate}
            title={eligibility.ok ? undefined : eligibility.reason ?? undefined}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-on-orange transition-all hover:bg-orange-dark active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-bone/30 border-t-bone" />
                Writing proposal...
              </>
            ) : (
              <>
                <Sparkles className="size-4" aria-hidden />
                {generationMode === 'premium' ? 'Generate premium proposal' : 'Generate proposal'}
              </>
            )}
          </button>
          {!eligibility.ok && profiles.length > 0 && (
            <span className="text-[12px] text-status-warning">{eligibility.reason}</span>
          )}
          {proposal && !generating && (
            <button
              type="button"
              onClick={() => void generate()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12px] text-graphite transition-colors hover:bg-bone hover:text-ink"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Regenerate
            </button>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-status-danger/20 bg-status-danger/5 px-4 py-3 text-[13px] text-status-danger">
          {error}
        </div>
      )}

      <div aria-live="polite" className="sr-only">
        {saveState === 'saving' ? 'Saving draft' : saveState === 'saved' ? 'Draft saved' : ''}
      </div>
      {saveState === 'saved' && (
        <div role="status" className="rounded-xl border border-status-success/20 bg-status-success/5 px-4 py-3 text-[13px] text-status-success">
          Draft saved — screening answers included
        </div>
      )}

      {proposal && !application && (
        <div className="space-y-3">
          <div className="rounded-xl bg-bone-raised p-3 ring-1 ring-line">
            <Textarea
              value={proposal}
              onChange={(e) => setProposal(e.target.value)}
              rows={12}
              className="border-0 bg-transparent px-1 py-1 text-[14px] leading-relaxed shadow-none focus-visible:ring-0"
            />
          </div>

          {readiness !== null && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Proposal</span>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium',
                  readiness.status === 'ready'
                    ? 'bg-status-success/15 text-status-success'
                    : 'bg-status-warning/15 text-status-warning',
                )}>
                  {readiness.status === 'ready' ? 'Ready to send' : 'Needs review'}
                </span>
              </div>
              {readiness.reasons.length > 0 && (
                <ul className="space-y-0.5">
                  {readiness.reasons.map((reason, index) => (
                    <li key={index} className="text-[11px] text-graphite">· {reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {screeningAnswers.length > 0 && (
            <div className="space-y-3 rounded-xl bg-cobalt/[0.04] p-3 ring-1 ring-cobalt/15">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-cobalt-ink">
                Screening answers — saved with the draft
              </p>
              {screeningAnswers.map((qa, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-[12px] font-medium text-ink">Q: {qa.question}</p>
                  <textarea
                    value={qa.answer}
                    onChange={(e) => setScreeningAnswers((prev) => prev.map((item, index) => index === i ? { ...item, answer: e.target.value } : item))}
                    rows={3}
                    aria-label={`Answer: ${qa.question}`}
                    className="w-full resize-y rounded-lg border border-line bg-bone-raised px-3 py-2 text-[12px] leading-relaxed text-ink focus:border-cobalt/40 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}

          {unsupportedClaims.length > 0 && (
            <div role="alert" className="space-y-1 rounded-xl border border-status-warning/30 bg-status-warning/5 px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-status-warning">
                Claims to verify before sending
              </p>
              <ul className="space-y-0.5">
                {unsupportedClaims.map((claim, i) => (
                  <li key={i} className="text-[12px] text-graphite">• {claim}</li>
                ))}
              </ul>
            </div>
          )}

          {evidenceUsed.length > 0 && (
            <details className="group rounded-xl bg-bone px-3 py-2.5 ring-1 ring-line">
              <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.14em] text-stone">
                Why this proposal — evidence used
              </summary>
              <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Relevant evidence</p>
              <ul className="mt-1 space-y-0.5">
                {evidenceUsed.map((item) => (
                  <li key={item.id} className="flex items-baseline gap-2 text-[12px] text-graphite">
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-stone">{item.kind.replace(/_/g, ' ')}</span>
                    <span className="min-w-0 truncate text-ink">{item.title}</span>
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer" className="shrink-0 text-[11px] text-cobalt-ink hover:underline">
                        link
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              {jobSignals.length > 0 && (
                <>
                  <p className="mt-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Job signals used</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {jobSignals.map((signal) => (
                      <span key={signal} className="rounded-full bg-bone-raised px-2 py-0.5 text-[10px] text-graphite ring-1 ring-line/70">
                        {signal}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </details>
          )}

          {belowGate && (
            <p className="text-[12px] text-status-danger">
              Score below {MIN_SCORE_TO_APPLY} — Relay does not recommend spending a Connect here.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyProposal()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink transition-colors hover:bg-bone"
            >
              {copied ? <Check className="size-3.5 text-status-success" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={saveState === 'saving' || !proposal.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] text-graphite transition-colors hover:bg-bone hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveState === 'saving' ? (
                <><RefreshCw className="size-3.5 animate-spin" aria-hidden />Saving…</>
              ) : saveState === 'saved' ? (
                <><Check className="size-3.5 text-status-success" aria-hidden />Saved</>
              ) : saveState === 'failed' ? (
                'Failed — Retry'
              ) : (
                'Save draft'
              )}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={belowGate}
              title={belowGate ? `Score below ${MIN_SCORE_TO_APPLY} — Relay does not recommend spending a Connect here.` : undefined}
              className={cn('ml-auto inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium transition-all', markAppliedButtonClass(false, belowGate))}
            >
              {belowGate ? 'Score too low to apply' : 'Mark applied'}
            </button>
          </div>
        </div>
      )}

      {application && (
        <div className="space-y-3">
          <div className="rounded-xl bg-bone px-4 py-3 ring-1 ring-line">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Submitted application</p>
            <p className="mt-1 text-[13px] text-ink">
              {application.connectsSpent ?? '—'} connects · {application.screeningAnswers.length} screening answers
            </p>
            {application.firstReplyAt && (
              <p className="mt-1 text-[12px] text-status-success">
                Client replied {new Date(application.firstReplyAt).toLocaleString()}
                {application.submittedAt && responseTimeMs(application.submittedAt, application.firstReplyAt) !== null
                  ? ` (after ${formatResponseTime(responseTimeMs(application.submittedAt, application.firstReplyAt)!)})`
                  : ''}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void followUp()}
              disabled={busy || jobStatus !== 'APPLIED'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink transition-colors hover:bg-bone disabled:cursor-not-allowed disabled:opacity-60"
            >
              Follow up
            </button>
            <button
              type="button"
              onClick={() => void archive()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] text-graphite transition-colors hover:bg-bone hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Archive className="size-3.5" aria-hidden />
              Archive
            </button>
          </div>
        </div>
      )}

      {!application && canDelete && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-stone transition-colors hover:text-status-danger disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Delete saved job
          </button>
        </div>
      )}

      {confirmOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-application-title" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-paper p-5 shadow-2xl ring-1 ring-line">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-stone">Confirm application</p>
              <h2 id="confirm-application-title" className="mt-1 text-[18px] font-medium text-ink">{jobTitle}</h2>
            </div>
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-graphite">Applying as</dt>
                <dd className="text-ink">{profiles.find((p) => p.id === activeProfileId)?.name ?? '—'} · Upwork</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-graphite">Rep</dt>
                <dd className="text-ink">{actingRep?.name ?? 'You'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-graphite">Screening answers</dt>
                <dd className="text-ink">{screeningAnswers.length} answered</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-graphite">Connects used</dt>
                <dd>
                  <input
                    type="number"
                    min={0}
                    value={connectsSpent}
                    onChange={(e) => setConnectsSpent(e.target.value)}
                    className="w-20 rounded-lg border border-line bg-bone-raised px-2 py-1 text-[13px] tabular-nums text-ink"
                    aria-label="Connects used"
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-graphite">Boost connects</dt>
                <dd>
                  <input
                    type="number"
                    min={0}
                    value={boostConnects}
                    onChange={(e) => setBoostConnects(e.target.value)}
                    className="w-20 rounded-lg border border-line bg-bone-raised px-2 py-1 text-[13px] tabular-nums text-ink"
                    aria-label="Boost connects"
                  />
                </dd>
              </div>
            </dl>
            <div className="max-h-40 overflow-auto rounded-xl bg-bone p-3 ring-1 ring-line">
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-ink/80">{proposal}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-graphite transition-colors hover:bg-bone hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmApplication()}
                disabled={submitting}
                className="rounded-lg bg-status-success px-4 py-1.5 text-[13px] font-medium text-on-success transition-opacity disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : 'Confirm application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
