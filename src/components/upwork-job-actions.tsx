'use client'

import { useState, useCallback } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from 'cn'
import type { Profile, ProofItem } from '@/lib/domain/types'

interface UpworkJobActionsProps {
  jobId: string
  jobTitle: string
  /** Stored score from computeUpworkScore (see upwork-rubric.ts), or null if not yet scored. */
  jobScore: number | null
  profiles: Profile[]
  matchedProofs: ProofItem[]
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

export function UpworkJobActions({ jobId, jobTitle, jobScore, profiles, matchedProofs }: UpworkJobActionsProps) {
  const belowGate = jobScore === null || jobScore < MIN_SCORE_TO_APPLY
  const [selectedProfileId, setSelectedProfileId] = useState(profiles[0]?.id ?? '')
  const [proposal, setProposal] = useState('')
  const [editing, setEditing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [selfCheckNote, setSelfCheckNote] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const proofHint = matchedProofs[0]?.projectSummary ?? null

  const generate = useCallback(async () => {
    if (!selectedProfileId) {
      setError('Select a profile first.')
      return
    }
    setGenerating(true)
    setError(null)
    setSelfCheckNote(null)
    setProposal('')
    try {
      const res = await fetch(`/api/upwork/jobs/${jobId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: selectedProfileId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Generation failed.')
      }
      const data = await res.json()
      setProposal(data.draft.text)
      setSelfCheckNote(data.draft.selfCheckNote)
      setEditing(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setGenerating(false)
    }
  }, [jobId, selectedProfileId])

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
    try {
      const res = await fetch(`/api/upwork/jobs/${jobId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, draftText: proposal.trim(), type: 'cover' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to save draft.')
      }
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    }
  }, [jobId, proposal])

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
        body: JSON.stringify({ sentText: proposal.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to mark as applied.')
      }
      setApplied(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as applied.')
    }
  }, [jobId, proposal, belowGate])

  return (
    <div className="space-y-4">
      <div className="srf-proof px-4 py-3">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Proposal Workspace</p>
        <p className="mt-1 text-[13px] text-graphite">
          Generate from an assigned profile, then edit and mark applied after human review.
        </p>
        {proofHint && (
          <p className="mt-2 text-[12px] text-ink">Relevant proof: {proofHint}</p>
        )}
      </div>

      {/* Profile selector */}
      {profiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-line bg-bone p-3">
          <label className="text-[12px] font-medium text-graphite">Proposal as</label>
          <select
            value={selectedProfileId}
            onChange={(e) => setSelectedProfileId(e.target.value)}
            className="rounded border border-line bg-bone-raised px-3 py-1.5 text-sm text-ink"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.platform === 'linkedin' ? 'LinkedIn' : 'Upwork'} {p.label ? `· ${p.label}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Generate button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => void generate()}
          disabled={generating || !selectedProfileId}
          className="inline-flex items-center gap-1.5 rounded bg-orange px-4 py-2 text-sm font-medium text-on-accent transition-all hover:bg-orange-dark active:scale-[0.97] disabled:opacity-50"
        >
          {generating ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-bone/30 border-t-bone" />
              Writing proposal...
            </>
          ) : (
            'Generate proposal'
          )}
        </button>
        {proposal && (
          <button
            onClick={() => void generate()}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded border border-line px-3 py-2 text-sm text-graphite transition-colors hover:bg-bone"
          >
            <RefreshCw className="size-3.5" />
            Regenerate
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger/5 px-4 py-3 text-sm text-status-danger">
          {error}
        </div>
      )}

      {/* Proposal editor */}
      {proposal && (
        <div className="space-y-2">
          <div className="rounded border border-line/60 bg-bone-raised p-4">
            <Textarea
              value={proposal}
              onChange={(e) => { setProposal(e.target.value); setEditing(true) }}
              rows={10}
              className="border-0 bg-transparent px-0 py-1 text-[14px] leading-relaxed shadow-none focus-visible:ring-0"
            />
          </div>

          {selfCheckNote && (
            <p className="text-xs text-graphite italic">{selfCheckNote}</p>
          )}

          {belowGate && !applied && (
            <p className="text-xs text-status-danger">
              Score below {MIN_SCORE_TO_APPLY} — Relay does not recommend spending a Connect here.
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => void copyProposal()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-ink transition-colors hover:bg-bone"
            >
              {copied ? <Check className="size-3.5 text-status-success" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={() => void saveDraft()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-graphite transition-colors hover:bg-bone"
            >
              Save draft
            </button>
            <button
              onClick={() => void markApplied()}
              disabled={applied || belowGate}
              title={belowGate ? `Score below ${MIN_SCORE_TO_APPLY} — Relay does not recommend spending a Connect here.` : undefined}
              className={cn('ml-auto inline-flex items-center gap-1.5 rounded px-4 py-2 text-sm font-medium transition-all', markAppliedButtonClass(applied, belowGate))}
            >
              {applied ? (
                <>
                  <Check className="size-4" />
                  Marked applied
                </>
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
