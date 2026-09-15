'use client'

import { memo, useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Flame,
  Info,
  Target,
  Trophy,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { StatusWord, VerdictWord } from '@/components/status-word'
import { ScoreRing } from '@/components/score-ring'
import { signalById } from '@/lib/score/signals'
import { readSse } from '@/lib/sse/client'
import { cn } from 'cn'
import type { LeadDetail } from '@/lib/store/types'
import type { Profile, ProofItem, ScoreResult } from '@/lib/domain/types'
import type { DraftResult, SelfCheck } from '@/lib/ai/draft'
import type { GenerationMode } from '@/lib/ai/generate'
import { GenerationModeSelector } from '@/components/generation-mode-selector'

const ARTIFACTS = [
  { id: 'dm', label: 'DM', count: { kind: 'words', max: 55, label: 'words' } },
  { id: 'connection', label: 'Connection note', count: { kind: 'chars', max: 300, label: 'characters' } },
  { id: 'upwork', label: 'Upwork letter', count: { kind: 'words', max: 350, label: 'words' } },
  { id: 'followup', label: 'Follow-up', count: { kind: 'words', max: 40, label: 'words' } },
  { id: 'reply', label: 'Reply', count: { kind: 'words', max: 200, label: 'words' } },
] as const

type ArtifactId = (typeof ARTIFACTS)[number]['id']

interface ArtifactDraftState {
  result: DraftResult | null
  text: string
}

function artifactCount(id: ArtifactId): { kind: 'words' | 'chars'; max: number; label: string } {
  return ARTIFACTS.find((a) => a.id === id)!.count
}

function countFor(kind: 'words' | 'chars', text: string): number {
  if (kind === 'chars') return text.length
  return text.trim().split(/\s+/).filter(Boolean).length
}



type DraftEvent =
  | { type: 'status'; message: string }
  | { type: 'proof'; items: ProofItem[] }
  | { type: 'profile'; profile?: Profile | null }
  | { type: 'attempt'; attempt: number; model: string; tier: 'cheap' | 'strong' }
  | { type: 'draft'; chunk: string }
  | { type: 'variant'; draft: import('@/lib/ai/draft').DraftVariant }
  | { type: 'selfcheck'; pass: boolean; selfCheck: SelfCheck }
  | { type: 'done'; draft: DraftResult; matchedProof: ProofItem | null }
  | { type: 'error'; message: string }

function hostOf(url: string | null): string | null {
  if (!url) return null
  try { return new URL(url).host } catch { return null }
}

function ScoreBreakdown({ score }: { score: ScoreResult }) {
  return (
    <div className="space-y-2.5">
      {score.breakdown.map((item) => {
        const frac = item.max > 0 ? item.points / item.max : 0
        return (
          <div key={item.category + item.label}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-graphite">{item.label}</span>
              <span className="text-mono-medium text-ink">{item.points}/{item.max}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-bone">
              <div
                className={cn('h-full rounded-full transition-all duration-700',
                  frac >= 1 ? 'bg-status-success' : frac > 0.5 ? 'bg-orange' : frac > 0 ? 'bg-orange/60' : 'bg-line',
                )}
                style={{ width: `${Math.max(frac * 100, frac > 0 ? 8 : 0)}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function NextBestAction({
  lead,
  verdict,
  hasReply,
  hasPriorSend,
  followupEligible,
  onAction,
}: {
  lead: LeadDetail
  verdict: string
  hasReply: boolean
  hasPriorSend: boolean
  followupEligible: boolean
  onAction?: () => void
}) {
  type Action = { label: string; description: string; cta: string; href?: string }
  let action: Action

  if (hasReply) {
    action = {
      label: 'Reply now',
      description: 'They wrote back. Every hour you wait lowers your chances.',
      cta: 'Draft a reply',
    }
  } else if (followupEligible) {
    action = {
      label: 'Follow up',
      description: 'No response yet. One follow-up, then move on.',
      cta: 'Generate follow-up',
    }
  } else if (lead.status === 'followed_up') {
    action = {
      label: 'Waiting',
      description: 'Follow-up sent. No further action unless they reply.',
      cta: 'Review lead',
    }
  } else if (hasPriorSend) {
    action = {
      label: 'Waiting',
      description: 'First message sent. Waiting for a reply.',
      cta: 'Review lead',
    }
  } else if (verdict === 'send') {
    action = {
      label: 'Send first message',
      description: 'Strong lead. Reach out while the signal is fresh.',
      cta: 'Generate draft',
    }
  } else if (verdict === 'research_more') {
    action = {
      label: 'Do more research',
      description: 'Promising, but not enough evidence yet. Add proof or context.',
      cta: 'Add research',
    }
  } else {
    action = {
      label: 'Not ready',
      description: 'This lead scored low. Focus on stronger opportunities.',
      cta: 'Find better leads',
      href: '/prospect',
    }
  }

  const isUrgent = hasReply || followupEligible || verdict === 'send'

  return (
    <div className={cn(
      'rounded-xl border p-4',
      isUrgent
        ? 'border-orange/20 bg-orange/[0.04]'
        : 'border-line bg-bone-raised',
    )}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-label text-stone">Next best action</p>
          <p className="mt-1 text-[15px] font-medium text-ink">{action.label}</p>
          <p className="mt-0.5 text-[13px] text-graphite">{action.description}</p>
        </div>
        <div className="shrink-0">
          {action.href ? (
            <a
              href={action.href}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ink transition-all hover:bg-bone active:scale-[0.97]"
            >
              {action.cta}
            </a>
          ) : (
            <button
              type="button"
              onClick={onAction}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-all active:scale-[0.97]',
                isUrgent
                  ? 'bg-orange text-bone hover:bg-orange-dark'
                  : 'bg-ink text-bone hover:bg-ink/90',
              )}
            >
              {action.cta}
              <ArrowRight className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function LeadWorkspace({
  lead,
  score,
  profiles,
  matchedProofs,
}: {
  lead: LeadDetail
  score: ScoreResult
  profiles: Profile[]
  matchedProofs: ProofItem[]
}) {
  const router = useRouter()
  const locked = lead.status === 'no' || lead.status === 'dead'
  const verdict = lead.verdict ?? score.verdict
  const canDraft = verdict === 'send' || verdict === 'research_more'

  const [artifact, setArtifact] = useState<ArtifactId>('dm')
  const [drafting, setDrafting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Partial<Record<ArtifactId, ArtifactDraftState>>>({})
  const [draftError, setDraftError] = useState<string | null>(null)
  const [sentText, setSentText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sentOk, setSentOk] = useState<{ todaySends: number } | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(profiles[0]?.id ?? null)
  const [proofList, setProofList] = useState<ProofItem[]>(matchedProofs)
  const [matchedProofId, setMatchedProofId] = useState<string | null>(null)
  const [variantDraft, setVariantDraft] = useState<import('@/lib/ai/draft').DraftVariant | null>(null)
  const [showVariant, setShowVariant] = useState(false)
  const [generationMode, setGenerationMode] = useState<GenerationMode>('standard')
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [capturedReplyText, setCapturedReplyText] = useState('')

  const streamBuffer = useRef('')

  const currentDraft = drafts[artifact] ?? { result: null, text: '' }
  const draft = currentDraft.result
  const draftText = currentDraft.text

  const signal = signalById(lead.signalType)
  const hasReply = lead.outcomes.some((o) => o.stage === 'replied')
  const hasPriorSend = lead.messages.some((m) => m.sentText && m.sentAt)
  // ONE follow-up, ever. A lead already in 'followed_up' status has used its
  // one follow-up and is permanently locked out of another — status
  // 'followed_up' is deliberately NOT in the eligible set below.
  const followupAlreadyUsed = lead.status === 'followed_up'
  const followupEligible = lead.status === 'contacted' && hasPriorSend && !followupAlreadyUsed

  const artifactDisabled: Record<ArtifactId, string | null> = {
    dm: null,
    connection: null,
    upwork: null,
    followup: followupEligible
      ? null
      : followupAlreadyUsed
        ? 'A follow-up was already sent on this lead. Only one, ever.'
        : lead.status === 'new'
          ? 'Eligible once this lead is contacted.'
          : 'Eligible once a first message has been sent.',
    reply: !hasReply ? 'Appears when a reply is on file.' : null,
  }

  const activeProof = proofList.find((p) => p.id === matchedProofId) ?? proofList[0] ?? null
  const chosenProfileId = profiles.some((p) => p.id === selectedProfileId) ? selectedProfileId : profiles[0]?.id ?? null
  const lastReply = lead.messages.filter((m) => m.type === 'reply' && m.sentText).at(-1)
  const prospectReplyText = capturedReplyText || lastReply?.sentText || ''

  const editDraft = useCallback((text: string) => {
    setDrafts((d) => ({ ...d, [artifact]: { result: d[artifact]?.result ?? null, text } }))
  }, [artifact])

  const generateDraft = useCallback(async (proofId?: string) => {
    const target = artifact
    if (locked) return
    if (target === 'reply' && !prospectReplyText) return
    setDrafting(true)
    setDraftError(null)
    setDrafts((d) => ({ ...d, [target]: { result: null, text: '' } }))
    setStatusMessage(null)
    setVariantDraft(null)
    setShowVariant(false)
    streamBuffer.current = ''
    try {
      const body: Record<string, unknown> = { type: target, profileId: chosenProfileId, proofId: proofId ?? matchedProofId ?? undefined, generationMode }
      if (target === 'reply' && prospectReplyText) {
        body.replyToMessageId = lastReply?.id ?? 'manual'
        if (capturedReplyText) {
          body.replyText = capturedReplyText
        }
      }
      const res = await fetch(`/api/leads/${lead.id}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await readSse<DraftEvent>(res, {
        onEvent(event) {
          if (event.type === 'status') { setStatusMessage(event.message); return }
          if (event.type === 'proof') { setProofList(event.items); if (!proofId && event.items.length > 0) setMatchedProofId(event.items[0].id); return }
          if (event.type === 'attempt') { if (event.attempt > 0) { streamBuffer.current = ''; setDrafts((d) => ({ ...d, [target]: { result: null, text: '' } })) } return }
          if (event.type === 'draft') { streamBuffer.current += event.chunk; setDrafts((d) => ({ ...d, [target]: { result: d[target]?.result ?? null, text: streamBuffer.current } })); return }
          if (event.type === 'variant') { setVariantDraft(event.draft); return }
          if (event.type === 'error') { setDraftError(event.message); return }
          if (event.type === 'done') { setDrafts((d) => ({ ...d, [target]: { result: event.draft, text: event.draft.draftText } })); if (event.matchedProof) setMatchedProofId(event.matchedProof.id); return }
        },
      })
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Drafting failed.')
    } finally {
      setDrafting(false)
      setStatusMessage(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact, locked, lead.id, chosenProfileId, matchedProofId, prospectReplyText, lastReply])

  const onDraftProof = useCallback((proofId: string) => {
    setMatchedProofId(proofId)
    void generateDraft(proofId)
  }, [generateDraft])

  const copyDraft = useCallback(async () => {
    if (!draftText) return
    try { await navigator.clipboard.writeText(draftText) } catch { /* selectable */ }
  }, [draftText])

  async function logSend() {
    if (!sentText.trim()) return
    setSending(true)
    setSendError(null)
    setSentOk(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentText: sentText.trim(), type: artifact }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to log send.')
      setSentOk({ todaySends: data.todaySends })
      setSentText('')
      router.refresh()
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to log send.')
    } finally {
      setSending(false)
    }
  }

  const textToCheck = sentText.trim() || draftText
  const { kind: countKind, max: countMax } = artifactCount(artifact)
  const count = textToCheck ? countFor(countKind, textToCheck) : 0

  const lower = textToCheck.toLowerCase()
  const companyNamed = lead.company.length > 0 && lower.includes(lead.company.toLowerCase())
  const priorSameType = lead.messages.some((m) => m.sentText && m.sentAt && m.type === artifact)
  const inPipeline = artifact === 'followup' ? !hasPriorSend : priorSameType

  const gates: Array<{ label: string; ok: boolean; why: string }> = [
    { label: 'Names the company', ok: companyNamed, why: companyNamed ? '' : `Doesn't name ${lead.company} — reader won't know it's about them.` },
    { label: `Within the ${ARTIFACTS.find((a) => a.id === artifact)?.label.toLowerCase()} limit`, ok: artifact === 'reply' || count <= countMax, why: count > countMax ? `${count} ${countKind === 'chars' ? 'chars' : 'words'} — limit is ${countMax}.` : '' },
    { label: 'Passed every draft check', ok: Boolean(draft?.passed), why: !draft?.passed ? (draft ? 'Draft flagged itself. Read notes below.' : 'Generate a draft first.') : '' },
    { label: artifact === 'followup' ? 'Continues an existing thread' : 'Not already sent on this line', ok: artifact === 'followup' ? hasPriorSend : !inPipeline, why: artifact === 'followup' ? (!hasPriorSend ? 'A follow-up needs a first message.' : '') : (inPipeline ? `Already sent to ${lead.company} — looks like spam.` : '') },
  ]
  const allGreen = Boolean(draft || sentText) && textToCheck.length > 0 && gates.every((g) => g.ok)
  const needOverride = Boolean(draft || sentText) && textToCheck.length > 0 && !allGreen
  const [overrideCheck, setOverrideCheck] = useState(false)

  const contactLine = lead.contactName
    ? `${lead.contactName}${lead.contactTitle ? ` · ${lead.contactTitle}` : ''}`
    : 'No contact named yet'
  const host = hostOf(lead.url)

  return (
    <div className="space-y-4">

      {/* ═══ 1. WHERE THIS LEAD STANDS ═══ */}
      <section className="reveal-up rounded-2xl border border-line/80 bg-bone-raised overflow-hidden">
        {/* Top bar with score */}
        <div className="flex flex-col lg:flex-row">
          {/* Lead info */}
          <div className="flex-1 p-5 sm:p-6">
            <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-sm text-graphite transition-colors hover:bg-bone hover:text-ink">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to Today
            </Link>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <VerdictWord verdict={verdict} />
              {lead.status !== 'new' && !hasReply && <StatusWord status={lead.status} />}
              {hasReply && <StatusWord status="replied" />}
            </div>

            <h1 className="mt-2 text-heading text-2xl text-ink sm:text-3xl">{lead.company}</h1>
            <p className="mt-0.5 text-sm text-graphite">{contactLine}</p>

            {/* Tags & meta */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {signal && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-orange/8 px-2 py-0.5 text-xs font-medium text-orange ring-1 ring-orange/10">
                  <Flame className="size-3" /> {signal.short}
                </span>
              )}
              {lead.url && (
                <a href={lead.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-bone px-2 py-0.5 text-xs text-ink transition-colors hover:bg-line">
                  {host ?? 'Source'} <ExternalLink className="size-2.5 text-graphite" />
                </a>
              )}
              {(lead.tags ?? []).map((t) => (
                <span key={t} className="rounded-lg bg-bone px-2 py-0.5 font-mono text-xs text-ink-soft">{t}</span>
              ))}
            </div>

            {/* Evidence */}
            <div className="mt-4 space-y-2 rounded-xl bg-bone/40 p-3">
              <div className="flex gap-2">
                <Target className="mt-0.5 size-3.5 shrink-0 text-orange" />
                <p className="text-sm leading-relaxed text-ink">{lead.signalEvidence || 'No signal evidence captured.'}</p>
              </div>
              {lead.verbatimQuote && (
                <p className="border-t border-line/40 pt-2 pl-5.5 text-sm italic text-graphite">
                  &ldquo;{lead.verbatimQuote}&rdquo;
                </p>
              )}
            </div>
          </div>

          {/* Score ring — right side on desktop */}
          <div className="flex shrink-0 flex-col items-center justify-center gap-3 border-t border-line/40 bg-bone/20 p-5 lg:border-t-0 lg:border-l lg:px-8">
            <ScoreRing score={score.total} size={88} />
            <div className="text-center">
              <p className="text-mono-medium text-xs text-graphite">out of 12</p>
              <p className="text-xs font-medium text-ink">
                {score.total >= 10 ? 'Strong lead' : score.total >= 7 ? 'Good lead' : score.total >= 4 ? 'Fair' : 'Weak'}
              </p>
            </div>
            {profiles.length > 0 ? (
              <label className="flex items-center gap-2 text-xs">
                <span className="text-graphite">As</span>
                <Select className="h-7 w-auto min-w-[7rem] py-0 text-xs" value={selectedProfileId ?? ''}
                  onChange={(e) => setSelectedProfileId(e.target.value || null)}>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.platform === 'linkedin' ? 'LinkedIn' : 'Upwork'} · {p.label ?? p.headline ?? 'Unnamed'}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <Link href="/profiles" className="text-xs text-orange underline-offset-4 hover:underline">Add identity</Link>
            )}
          </div>
        </div>

        {/* Score breakdown — collapsible */}
        <div className="border-t border-line/40 px-5 py-4 sm:px-6">
          <details className="group">
            <summary className="flex cursor-pointer items-center gap-2 text-sm text-graphite">
              <Info className="size-3.5" />
              <span>Why this score</span>
              <ChevronDown className="ml-auto size-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 max-w-md">
              <ScoreBreakdown score={score} />
            </div>
          </details>
        </div>
      </section>

      {/* Locked / not eligible */}
      {locked && (
        <Alert variant="destructive">
          <AlertTitle>This lead is locked</AlertTitle>
          <AlertDescription>Marked {lead.status}. No drafts or sends for anyone.</AlertDescription>
        </Alert>
      )}

      {!canDraft && !locked && (
        <div className="flex items-start gap-3 rounded-xl border border-line bg-bone/40 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" />
          <p className="text-sm leading-relaxed text-graphite">
            Scored {score.total}/12 — not eligible for drafting. Add more research to push it over the line.
          </p>
        </div>
      )}

      {/* ═══ 2. PROOF MATCH ═══ */}
      {canDraft && !locked && activeProof && (
        <section className="reveal-up stagger-1 rounded-2xl border border-orange/15 bg-gradient-to-br from-orange/[0.04] to-transparent p-5">
          <div className="flex items-center gap-2 text-orange">
            <Trophy className="size-4" />
            <h2 className="text-heading text-sm text-ink">Proof to cite</h2>
          </div>
          <div className="mt-3 rounded-xl border border-orange/10 bg-paper/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {activeProof.permissionOnFile && activeProof.clientName ? activeProof.clientName : 'Client protected'}
                </p>
                {activeProof.reviewQuote && (
                  <p className="mt-1 text-xs italic text-graphite">&ldquo;{activeProof.reviewQuote}&rdquo;</p>
                )}
                <p className="mt-1.5 text-xs leading-relaxed text-graphite">{activeProof.projectSummary}</p>
                {activeProof.tags.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {activeProof.tags.map((t) => {
                      const matches = (lead.tags ?? []).some((lt) => lt.toLowerCase() === t.toLowerCase())
                      return (
                        <span key={t} className={cn('rounded-md px-1.5 py-0.5 font-mono text-[10px] ring-1',
                          matches ? 'bg-orange/10 text-orange ring-orange/20' : 'bg-bone text-graphite ring-transparent')}>
                          {t}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
              <Button variant="orange" size="sm" onClick={() => onDraftProof(activeProof.id)} disabled={drafting}>
                Use this
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ═══ NEXT BEST ACTION ═══ */}
      {canDraft && !locked && (
        <section className="reveal-up stagger-1">
          <NextBestAction
            lead={lead}
            verdict={verdict}
            hasReply={hasReply}
            hasPriorSend={hasPriorSend}
            followupEligible={followupEligible}
            onAction={() => void generateDraft()}
          />
        </section>
      )}

      {/* ═══ 3. DRAFT ═══ */}
      {canDraft && !locked && (
        <section className="reveal-up stagger-2 space-y-4">
          <div className="rounded-2xl border border-line/60 bg-bone-raised p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-heading text-base text-ink">Draft</h2>
              {draft && (
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                  draft.passed ? 'bg-status-success/8 text-status-success' : 'bg-status-warning/8 text-status-warning')}>
                  {draft.passed ? <Check className="size-3" /> : <X className="size-3" />}
                  {draft.passed ? 'Ready to send' : 'Needs an edit'}
                </span>
              )}
            </div>

            {/* Artifact selector */}
            <div className="mt-4 flex flex-wrap gap-1 rounded-xl bg-bone/50 p-1">
              {ARTIFACTS.map((t) => {
                const disabledHint = artifactDisabled[t.id]
                const active = artifact === t.id
                return (
                  <button key={t.id} role="tab" aria-selected={active} aria-disabled={Boolean(disabledHint)}
                    title={disabledHint ?? undefined}
                    onClick={() => { if (!disabledHint) { setOverrideCheck(false); setArtifact(t.id) } }}
                    className={cn(
                      'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all',
                      active ? 'bg-ink text-bone shadow-sm' : disabledHint ? 'cursor-not-allowed text-graphite/50' : 'text-graphite hover:bg-bone hover:text-ink',
                    )}>
                    {t.label}
                  </button>
                )
              })}
            </div>

            {artifact === 'reply' && hasReply && (
              <div className="mt-4 rounded-xl border border-line/60 bg-bone/30 p-3">
                <Label htmlFor="reply-text" className="text-xs text-graphite">Prospect&apos;s reply (paste what they wrote)</Label>
                <Textarea id="reply-text" value={capturedReplyText} onChange={(e) => setCapturedReplyText(e.target.value)}
                  rows={3} className="mt-1 border-0 bg-transparent px-0 py-1 text-sm shadow-none focus-visible:ring-0"
                  placeholder="Paste the prospect's reply here..." />
              </div>
            )}

            {artifactDisabled[artifact] ? (
              <p className="mt-3 text-sm text-graphite">{artifactDisabled[artifact]}</p>
            ) : (
              <>
                 <div className="mt-4 flex flex-wrap items-center gap-3">
                   <Button variant="orange" onClick={() => void generateDraft()} disabled={drafting || locked || (artifact === 'reply' && !prospectReplyText)} loading={drafting}>
                     {drafting ? 'Drafting...' : draft ? 'Rewrite' : 'Generate draft'}
                   </Button>
                   <GenerationModeSelector value={generationMode} onChange={setGenerationMode} compact />
                  {statusMessage ? (
                    <span className="flex items-center gap-2 text-sm text-graphite">
                      <span className="size-1.5 rounded-full bg-orange gentle-pulse" />
                      {statusMessage}
                    </span>
                  ) : (
                    <span className="text-mono-medium text-xs text-graphite">⌘ + Enter</span>
                  )}
                </div>

                {draftError && (
                  <div className="mt-3 space-y-2">
                    <Alert variant="destructive">
                      <AlertTitle>Draft failed</AlertTitle>
                      <AlertDescription>{draftError}</AlertDescription>
                    </Alert>
                    <Button variant="outline" size="sm" onClick={() => void generateDraft()}>Try again</Button>
                  </div>
                )}

                {drafting || draft || draftText ? (
                  <div className="mt-4 rounded-xl border-2 border-ink/8 bg-bone/15 p-3">
                    <Textarea
                      value={showVariant && variantDraft ? variantDraft.draftText : draftText}
                      onChange={(e) => editDraft(e.target.value)}
                      rows={6}
                      className="max-h-[28rem] overflow-y-auto border-0 bg-transparent px-0 py-1 text-[14px] leading-relaxed shadow-none focus-visible:ring-0"
                      aria-label="Draft text, editable"
                      placeholder="Your message appears here as it is written. Edit it freely."
                    />
                    <div className="mt-2 flex items-center justify-between border-t border-line/50 pt-2">
                      <span className={cn('font-mono text-xs',
                        count > countMax ? 'text-status-danger' : count >= countMax * 0.9 ? 'text-status-warning' : 'text-status-success')}>
                        {count} {artifactCount(artifact).label} / {countMax}
                      </span>
                      <button onClick={() => void copyDraft()}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-graphite transition-colors hover:bg-bone hover:text-ink">
                        <Copy className="size-3" /> Copy
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Self-check notes */}
                {draft && !draft.passed && (
                  <div className="mt-3 space-y-1">
                    {!draft.selfCheck.test1ReplyOrDelete && (
                      <p className="flex items-start gap-2 text-xs text-status-warning">
                        <X className="mt-0.5 size-3 shrink-0" /> Would likely be deleted, not replied to.
                      </p>
                    )}
                    {!draft.selfCheck.test2NotGeneric && (
                      <p className="flex items-start gap-2 text-xs text-status-warning">
                        <X className="mt-0.5 size-3 shrink-0" /> Too generic — would survive a company swap.
                      </p>
                    )}
                    {!draft.selfCheck.codeChecks.companyMentioned && (
                      <p className="flex items-start gap-2 text-xs text-status-warning">
                        <X className="mt-0.5 size-3 shrink-0" /> Does not name {lead.company}.
                      </p>
                    )}
                    {!draft.selfCheck.codeChecks.specificEvidenceMentioned && (
                      <p className="flex items-start gap-2 text-xs text-status-warning">
                        <X className="mt-0.5 size-3 shrink-0" /> No specific detail from the lead carried through.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ═══ 4. SEND ═══ */}
          <div className="rounded-2xl border border-line/60 bg-bone-raised p-5">
            <h2 className="text-heading text-base text-ink">Send it</h2>
            <p className="mt-1 text-sm text-graphite">Relay never sends for you. Copy the message, send it yourself, then log what you sent.</p>

            {/* Pre-send gates */}
            {(draft || textToCheck) && (
              <div className="mt-4 space-y-1.5 rounded-xl bg-bone/30 p-3">
                {gates.map((g) => (
                  <div key={g.label} className={cn('flex items-start gap-2 text-sm', g.ok ? 'text-status-success' : 'text-graphite')}>
                    {g.ok
                      ? <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      : <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line" />}
                    <span>
                      {g.label}
                      {!g.ok && g.why ? <span className="block text-xs text-status-warning">{g.why}</span> : null}
                    </span>
                  </div>
                ))}
                {needOverride && (
                  <label className="flex items-start gap-2.5 pt-1 text-xs text-graphite">
                    <input type="checkbox" checked={overrideCheck} onChange={(e) => setOverrideCheck(e.target.checked)} className="mt-0.5 size-4 accent-gold" />
                    <span>I read the flagged lines and will send this as written anyway.</span>
                  </label>
                )}
              </div>
            )}

            <div className="mt-4 grid gap-1.5">
              <Label htmlFor="sent-text">Text you actually sent</Label>
              <Textarea id="sent-text" value={sentText} onChange={(e) => setSentText(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { if (needOverride && !overrideCheck) return; e.preventDefault(); void logSend() } }}
                rows={4} disabled={locked} className="max-h-[16rem] overflow-y-auto"
                placeholder={draft ? 'Paste the draft once it looks right, or paste what you typed.' : 'Paste what you actually sent. No auto-send, ever.'} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <Button variant="orange" onClick={() => void logSend()} disabled={sending || locked || !sentText.trim() || (needOverride && !overrideCheck)} loading={sending}>
                {sending ? 'Logging...' : needOverride && !overrideCheck ? 'Check the flags to log' : 'Log this send'}
              </Button>
              <span className="text-mono-medium text-xs text-graphite">⌘ + Enter</span>
            </div>
            {sendError && <p className="mt-2 text-sm text-status-danger" role="alert">{sendError}</p>}
            {sentOk && <p className="mt-2 text-sm text-status-success">Logged. {sentOk.todaySends} {artifact} messages sent today.</p>}
          </div>
        </section>
      )}

      {/* ═══ 5. TIMELINE (demoted, collapsible) ═══ */}
      {canDraft && !locked && (
        <section className="reveal-up stagger-3">
          <button
            type="button"
            onClick={() => setTimelineOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-xl border border-line/60 bg-bone-raised px-5 py-3 text-left transition-colors hover:bg-bone/30"
          >
            <span className="text-sm font-medium text-graphite">Timeline</span>
            {timelineOpen ? <ChevronUp className="size-4 text-graphite" /> : <ChevronDown className="size-4 text-graphite" />}
          </button>
          {timelineOpen && (
            <div className="mt-2 rounded-xl border border-line/60 bg-bone-raised p-5">
              <Timeline lead={lead} />
            </div>
          )}
        </section>
      )}
    </div>
  )
}

const Timeline = memo(function Timeline({ lead }: { lead: LeadDetail }) {
  return (
    <div>
      <h2 className="text-sm font-medium text-ink">Timeline</h2>
      {lead.messages.length === 0 && lead.outcomes.length === 0 ? (
        <p className="mt-2 text-sm text-graphite">Nothing here yet.</p>
      ) : (
        <ul className="mt-3 space-y-0">
          {[...lead.outcomes]
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
            .map((o) => (
              <li key={o.id} className="relative flex items-start gap-3 py-3">
                <div className="flex flex-col items-center">
                  <span className="size-2 rounded-full bg-orange" aria-hidden="true" />
                  <div className="w-px flex-1 bg-line" />
                </div>
                <div className="pb-3">
                  <span className="text-sm text-ink">{o.stage}</span>
                  <span className="ml-2 text-mono-medium text-xs text-graphite">
                    {new Date(o.occurredAt).toLocaleDateString()}{' '}
                    {new Date(o.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </li>
            ))}
          {[...lead.messages]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((m) => (
              <li key={m.id} className="relative flex items-start gap-3 py-3">
                <div className="flex flex-col items-center">
                  <span className="size-2 rounded-full bg-ink/20" aria-hidden="true" />
                  <div className="w-px flex-1 bg-line" />
                </div>
                <div className="pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink">{m.type}</span>
                    <span className="text-mono-medium text-xs text-graphite">
                      {m.sentAt ? `sent ${new Date(m.sentAt).toLocaleDateString()}` : `drafted ${new Date(m.createdAt).toLocaleDateString()}`}
                    </span>
                  </div>
                  {m.sentText ? <p className="mt-1 text-xs leading-relaxed text-graphite">{m.sentText}</p>
                    : m.draftText ? <p className="mt-1 text-xs leading-relaxed text-graphite">{m.draftText}</p> : null}
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
})

export type { SelfCheck }
