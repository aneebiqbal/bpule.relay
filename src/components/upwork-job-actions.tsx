'use client'

/**
 * Upwork proposal workspace — the action surface on a job.
 *
 * Generate from a sending profile, edit, save, then mark applied after human
 * review. The profile requirement is explicit: without one, the workspace says
 * so and offers the one action that unblocks it — a rep views their profiles,
 * an admin assigns or configures one. A load failure is never reported as "no
 * profile assigned".
 */
import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Copy, RefreshCw, Sparkles, UserPlus, AlertTriangle } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from 'cn'
import type { ProofItem } from '@/lib/domain/types'

/**
 * One eligible sending profile. A plain DTO, so this client component never
 * imports the server-side read model that produced it.
 */
export interface ProposalProfileOption {
  id: string
  name: string
  channels: string[]
}

interface UpworkJobActionsProps {
  jobId: string
  jobTitle: string
  /** Stored score from computeUpworkScore (see upwork-rubric.ts), or null if not yet scored. */
  jobScore: number | null
  /** Eligible Upwork-capable profiles for the acting rep, already filtered. */
  profiles: ProposalProfileOption[]
  matchedProofs: ProofItem[]
  /** The persisted cover draft, so a saved proposal survives a reload. */
  savedDraft?: string | null
  /** Admin/owner: offer the on-behalf rep selector. */
  isAdmin?: boolean
  /** Org reps, used only for the admin on-behalf selector. */
  reps?: Array<{ id: string; name: string }>
  /** The rep whose profiles are eligible — the signed-in rep, or the selected rep. */
  actingRepId?: string | null
  /** True when the eligibility read failed. Distinct from a valid empty list. */
  profilesLoadFailed?: boolean
}

// Relay does not recommend spending a Connect below this score — see
// verdictFor() in upwork-rubric.ts (6-10 apply, 3-5 apply_if_connects, 0-2
// skip). Mirrors the hard gate enforced server-side in
// /api/upwork/jobs/[id]/apply/route.ts — this is a UI convenience only, not
// the actual boundary.
const MIN_SCORE_TO_APPLY = 6

function markAppliedButtonClass(applied: boolean, belowGate: boolean): string {
  if (applied) return 'bg-status-success/10 text-status-success'
  if (belowGate) return 'bg-status-success/40 text-on-accent cursor-not-allowed opacity-60'
  return 'bg-status-success text-on-accent hover:bg-status-success/90'
}

function channelLabel(channels: string[]): string {
  return channels.map((channel) => channel.toUpperCase()).join(' · ')
}

export function UpworkJobActions({
  jobId,
  jobScore,
  profiles,
  matchedProofs,
  savedDraft,
  isAdmin = false,
  reps = [],
  actingRepId = null,
  profilesLoadFailed = false,
}: UpworkJobActionsProps) {
  const router = useRouter()
  const belowGate = jobScore === null || jobScore < MIN_SCORE_TO_APPLY
  // Exact eligibility reason for the disabled Generate button (QA BUG-11-08):
  // never leave it disabled without saying why.
  const eligibility = (() => {
    if (profilesLoadFailed) return { ok: false, reason: 'Profiles could not be loaded. Retry.' }
    if (profiles.length === 0) return { ok: false, reason: 'Assign an Upwork profile first.' }
    if (jobScore === null) return { ok: false, reason: 'Analyze this job before generating a proposal.' }
    return { ok: true as const, reason: null as string | null }
  })()
  const [selectedProfileId, setSelectedProfileId] = useState('')
  // A rep switch changes the eligible list; a stored id that is no longer
  // eligible falls back to the first one rather than silently generating in a
  // profile that does not belong to the acting rep.
  const activeProfileId = profiles.some((option) => option.id === selectedProfileId)
    ? selectedProfileId
    : (profiles[0]?.id ?? '')
  // Restore the persisted draft: a saved proposal must survive a reload, or
  // "Save draft" is a lie (BUG-31).
  const [proposal, setProposal] = useState(savedDraft ?? '')
  const [generating, setGenerating] = useState(false)
  const canGenerate = eligibility.ok && !generating
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [selfCheckNote, setSelfCheckNote] = useState<string | null>(null)
  const [qualityScore, setQualityScore] = useState<number | null>(null)
  const [questionAnswers, setQuestionAnswers] = useState<Array<{ question: string; answer: string }>>([])
  const [copiedAnswer, setCopiedAnswer] = useState<number | null>(null)
  const [evidenceUsed, setEvidenceUsed] = useState<Array<{ id: string; kind: string; title: string; url: string | null }>>([])
  const [unsupportedClaims, setUnsupportedClaims] = useState<string[]>([])
  const [generationMode, setGenerationMode] = useState<'standard' | 'premium'>('standard')
  const [applied, setApplied] = useState(false)
  // Save-draft lifecycle. `saved` is confirmed only after the server returns.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const saveInFlightRef = useRef(false)
  const proofHint = matchedProofs[0]?.projectSummary ?? null
  const actingRep = reps.find((rep) => rep.id === actingRepId) ?? null

  const generate = useCallback(async () => {
    if (!activeProfileId) {
      setError('Select a profile first.')
      return
    }
    setGenerating(true)
    setError(null)
    setSelfCheckNote(null)
    setQualityScore(null)
    setQuestionAnswers([])
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
      setSelfCheckNote(data.draft.selfCheckNote)
      setQualityScore(data.draft.qualityScore ?? null)
      setQuestionAnswers(data.draft.questionAnswers ?? [])
      setEvidenceUsed(data.draft.evidenceUsed ?? [])
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
    // A double-click must not fire two saves; the server also collapses them to
    // one draft row, but the UI should not look like it is still working.
    if (saveInFlightRef.current) return
    saveInFlightRef.current = true
    setSaveState('saving')
    setError(null)
    try {
      const res = await fetch(`/api/upwork/jobs/${jobId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          draftText: proposal.trim(),
          type: 'cover',
          profileId: activeProfileId || undefined,
          repId: actingRepId ?? undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to save draft.')
      }
      // Confirmed by the server: it is only now safe to say "Saved".
      setSaveState('saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
      setSaveState('failed')
    } finally {
      saveInFlightRef.current = false
    }
  }, [jobId, proposal, activeProfileId, actingRepId])

  const markApplied = useCallback(async () => {
    if (!proposal.trim()) {
      setError('Generate a proposal before marking as applied.')
      return
    }
    if (belowGate) {
      setError(`Score below ${MIN_SCORE_TO_APPLY} — Relay does not recommend spending a Connect here.`)
      return
    }
    try {
      const res = await fetch(`/api/upwork/jobs/${jobId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentText: proposal.trim(),
          profileId: activeProfileId || undefined,
          repId: actingRepId ?? undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to mark as applied.')
      }
      setApplied(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as applied.')
    }
  }, [jobId, proposal, belowGate, activeProfileId, actingRepId])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone">Proposal workspace</p>
          <p className="mt-1 text-[13px] text-graphite">
            Generate from a sending profile, then edit and mark applied after human review.
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

      {/* Admin/owner on-behalf: pick the rep whose profiles are eligible. */}
      {isAdmin && reps.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-bone px-4 py-3 ring-1 ring-line">
          {/* Deliberately not "Generate proposal for" — that wording collided
              with the Generate button directly below and read as two actions. */}
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

      {/* Load failure: a data problem, explicitly not an empty assignment. */}
      {profilesLoadFailed ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-status-danger/30 bg-status-danger/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-status-danger/10 ring-1 ring-status-danger/20">
              <AlertTriangle className="size-4 text-status-danger" aria-hidden />
            </span>
            <div>
              <p className="text-[13px] font-medium text-ink">Profiles could not be loaded</p>
              <p className="mt-0.5 text-[12px] text-graphite">
                This is a data problem, not an empty assignment. Retry — nothing was sent.
              </p>
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
        /* Valid empty: actionable, and different for a rep than for an admin. */
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
                <Link
                  href="/team/profiles"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98]"
                >
                  Assign profile
                </Link>
                <Link
                  href="/team/profiles?add=1"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:bg-bone hover:text-ink"
                >
                  Create / configure profile
                </Link>
              </>
            ) : (
              <Link
                href="/rep/assigned-profiles"
                className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98]"
              >
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
          <button
            type="button"
            onClick={() => setGenerationMode(generationMode === 'standard' ? 'premium' : 'standard')}
            aria-pressed={generationMode === 'premium'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors',
              generationMode === 'premium' ? 'border-cobalt/30 bg-cobalt/10 text-cobalt' : 'border-line text-graphite hover:bg-bone-raised hover:text-ink',
            )}
          >
            {generationMode === 'premium' ? '★ Premium' : 'Standard'}
          </button>
          {generationMode === 'premium' && (
            <span className="text-[11px] text-graphite">Stronger model + client research</span>
          )}
        </div>
      )}

      {/* Generate */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={!canGenerate}
          title={eligibility.ok ? undefined : eligibility.reason ?? undefined}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-on-accent transition-all hover:bg-orange-dark active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
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
          Draft saved
        </div>
      )}

      {/* Editor */}
      {proposal && (
        <div className="space-y-3">
          <div className="rounded-xl bg-bone-raised p-3 ring-1 ring-line">
            <Textarea
              value={proposal}
              onChange={(e) => setProposal(e.target.value)}
              rows={12}
              className="border-0 bg-transparent px-1 py-1 text-[14px] leading-relaxed shadow-none focus-visible:ring-0"
            />
          </div>

          {qualityScore !== null && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Proposal quality</span>
              <span className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                qualityScore >= 8 ? 'bg-status-success/15 text-status-success' :
                qualityScore >= 5 ? 'bg-status-warning/15 text-status-warning' :
                'bg-status-danger/15 text-status-danger',
              )}>
                {qualityScore}/10
              </span>
              {qualityScore < 7 && (
                <span className="text-[11px] text-status-warning">Consider regenerating for a stronger proposal.</span>
              )}
            </div>
          )}

          {selfCheckNote && <p className="text-[12px] italic text-graphite">{selfCheckNote}</p>}

          {questionAnswers.length > 0 && (
            <div className="space-y-3 rounded-xl bg-cobalt/[0.04] p-3 ring-1 ring-cobalt/15">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-cobalt">
                Screening answers — edit each, then copy into Upwork
              </p>
              {questionAnswers.map((qa, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-[12px] font-medium text-ink">Q: {qa.question}</p>
                  <textarea
                    value={qa.answer}
                    onChange={(e) => setQuestionAnswers((prev) => prev.map((item, index) => index === i ? { ...item, answer: e.target.value } : item))}
                    rows={3}
                    aria-label={`Answer: ${qa.question}`}
                    className="w-full resize-y rounded-lg border border-line bg-bone-raised px-3 py-2 text-[12px] leading-relaxed text-ink focus:border-cobalt/40 focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(qa.answer)
                          setCopiedAnswer(i)
                          setTimeout(() => setCopiedAnswer(null), 1500)
                        } catch { /* clipboard unavailable */ }
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-graphite transition-colors hover:bg-bone hover:text-ink"
                    >
                      {copiedAnswer === i ? <Check className="size-3 text-status-success" aria-hidden /> : <Copy className="size-3" aria-hidden />}
                      {copiedAnswer === i ? 'Copied' : 'Copy answer'}
                    </button>
                  </div>
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
            <div className="space-y-1 rounded-xl bg-bone px-3 py-2.5 ring-1 ring-line">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Proof available to this proposal</p>
              <ul className="space-y-0.5">
                {evidenceUsed.map((item) => (
                  <li key={item.id} className="flex items-baseline gap-2 text-[12px] text-graphite">
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-stone">{item.kind.replace(/_/g, ' ')}</span>
                    <span className="min-w-0 truncate text-ink">{item.title}</span>
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer" className="shrink-0 text-[11px] text-cobalt hover:underline">
                        link
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {belowGate && !applied && (
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
              onClick={() => void markApplied()}
              disabled={applied || belowGate}
              title={belowGate ? `Score below ${MIN_SCORE_TO_APPLY} — Relay does not recommend spending a Connect here.` : undefined}
              className={cn('ml-auto inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium transition-all', markAppliedButtonClass(applied, belowGate))}
            >
              {applied ? (
                <><Check className="size-4" />Marked applied</>
              ) : belowGate ? (
                'Score too low to apply'
              ) : (
                'Mark as applied'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
