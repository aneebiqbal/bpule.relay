'use client'

import { memo, useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
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

function verdictCall(verdict: ScoreResult['verdict']): string {
  if (verdict === 'send') return 'Worth your next thirty seconds.'
  if (verdict === 'research_more') return 'Promising but thin. More sources first.'
  return 'Not enough here to act on.'
}

function researchWhy(lead: {
  contactName?: string | null
  url?: string | null
  verbatimQuote?: string | null
  tags?: string[]
}): string | null {
  const missing: string[] = []
  if (!lead.url) missing.push('a source URL')
  if (!lead.contactName) missing.push('a named contact')
  if (!lead.verbatimQuote) missing.push('their own words')
  if (!lead.tags || lead.tags.length === 0) missing.push('stack tags')
  return missing.length > 0 ? missing.join(', ') : null
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

function Chip({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'mono' | 'gold'
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'rounded-lg px-2.5 py-1 text-xs font-medium',
        tone === 'mono'
          ? 'bg-paper-tint font-mono text-ink'
          : tone === 'gold'
            ? 'bg-gold/10 text-gold'
            : 'bg-paper-tint text-ink/80',
      )}
    >
      {children}
    </span>
  )
}

function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
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
  const [timelineOpen, setTimelineOpen] = useState(false)

  const streamBuffer = useRef('')

  const currentDraft = drafts[artifact] ?? { result: null, text: '' }
  const draft = currentDraft.result
  const draftText = currentDraft.text

  const signal = signalById(lead.signalType)
  const hasReply = lead.outcomes.some((o) => o.stage === 'replied')
  const hasPriorSend = lead.messages.some((m) => m.sentText && m.sentAt)
  const followupEligible =
    (lead.status === 'contacted' || lead.status === 'followed_up') && hasPriorSend

  const artifactDisabled: Record<ArtifactId, string | null> = {
    dm: null,
    connection: null,
    upwork: null,
    followup: followupEligible
      ? null
      : lead.status === 'new'
        ? 'Eligible once this lead is contacted.'
        : 'Eligible once a first message has been sent.',
    reply: hasReply
      ? 'Reply text capture lands with the next pass. Drafting stops here so nothing gets written blind.'
      : 'Appears when a reply is on file.',
  }

  const activeProof = proofList.find((p) => p.id === matchedProofId) ?? proofList[0] ?? null

  const chosenProfileId = profiles.some((p) => p.id === selectedProfileId)
    ? selectedProfileId
    : profiles[0]?.id ?? null

  const editDraft = useCallback(
    (text: string) => {
      setDrafts((d) => ({ ...d, [artifact]: { result: d[artifact]?.result ?? null, text } }))
    },
    [artifact],
  )

  const generateDraft = useCallback(
    async (proofId?: string) => {
      const target = artifact
      if (target === 'reply') return
      if (locked) return
      setDrafting(true)
      setDraftError(null)
      setDrafts((d) => ({ ...d, [target]: { result: null, text: '' } }))
      setStatusMessage(null)
      setVariantDraft(null)
      setShowVariant(false)
      streamBuffer.current = ''
      try {
        const res = await fetch(`/api/leads/${lead.id}/draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: target,
            profileId: chosenProfileId,
            proofId: proofId ?? matchedProofId ?? undefined,
          }),
        })
        await readSse<DraftEvent>(res, {
          onEvent(event) {
            if (event.type === 'status') { setStatusMessage(event.message); return }
            if (event.type === 'proof') {
              setProofList(event.items)
              if (!proofId && event.items.length > 0) setMatchedProofId(event.items[0].id)
              return
            }
            if (event.type === 'attempt') {
              if (event.attempt > 0) {
                streamBuffer.current = ''
                setDrafts((d) => ({ ...d, [target]: { result: null, text: '' } }))
              }
              return
            }
            if (event.type === 'draft') {
              streamBuffer.current += event.chunk
              setDrafts((d) => ({ ...d, [target]: { result: d[target]?.result ?? null, text: streamBuffer.current } }))
              return
            }
            if (event.type === 'variant') { setVariantDraft(event.draft); return }
            if (event.type === 'error') { setDraftError(event.message); return }
            if (event.type === 'done') {
              setDrafts((d) => ({ ...d, [target]: { result: event.draft, text: event.draft.draftText } }))
              if (event.matchedProof) setMatchedProofId(event.matchedProof.id)
              return
            }
          },
        })
      } catch (err) {
        setDraftError(err instanceof Error ? err.message : 'Drafting failed.')
      } finally {
        setDrafting(false)
        setStatusMessage(null)
      }
    },
    [artifact, locked, lead.id, chosenProfileId, matchedProofId],
  )

  const onDraftProof = useCallback(
    (proofId: string) => {
      setMatchedProofId(proofId)
      void generateDraft(proofId)
    },
    [generateDraft],
  )

  const copyDraft = useCallback(async () => {
    if (!draftText) return
    try { await navigator.clipboard.writeText(draftText) } catch { /* text is selectable */ }
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
    {
      label: 'Names the company',
      ok: companyNamed,
      why: companyNamed ? '' : `The message does not name ${lead.company}, so the reader cannot tell it is about them.`,
    },
    {
      label: `Within the ${ARTIFACTS.find((a) => a.id === artifact)?.label.toLowerCase()} limit`,
      ok: artifact === 'reply' || count <= countMax,
      why: count > countMax
        ? `Current text is ${count} ${countKind === 'chars' ? 'characters' : 'words'}; the limit is ${countMax}.`
        : '',
    },
    {
      label: 'Passed every draft check',
      ok: Boolean(draft?.passed),
      why: !draft?.passed ? (draft ? 'The draft flagged itself. Read the notes and fix.' : 'Generate a draft first.') : '',
    },
    {
      label: artifact === 'followup' ? 'Continues an existing thread' : 'Not already sent on this line',
      ok: artifact === 'followup' ? hasPriorSend : !inPipeline,
      why: artifact === 'followup'
        ? !hasPriorSend ? 'A follow-up needs a first message on file.' : ''
        : inPipeline ? `A ${artifact} for ${lead.company} is already logged. Sending again looks like spam.` : '',
    },
  ]
  const allGreen = Boolean(draft || sentText) && textToCheck.length > 0 && gates.every((g) => g.ok)
  const needOverride = Boolean(draft || sentText) && textToCheck.length > 0 && !allGreen
  const [overrideCheck, setOverrideCheck] = useState(false)

  const contactLine = lead.contactName
    ? `${lead.contactName}${lead.contactTitle ? ` · ${lead.contactTitle}` : ''}`
    : 'No contact named yet'
  const host = hostOf(lead.url)

  return (
    <div className="space-y-5">
      {/* ═══ 1. WHERE THIS LEAD STANDS ═══ */}
      <section className="reveal-up rounded-[1.75rem] border border-line/80 bg-surface-raised p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate transition-colors hover:bg-paper-tint hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to Today
            </Link>
            <h1 className="mt-2 text-heading text-2xl text-ink sm:text-3xl">{lead.company}</h1>
            <p className="mt-0.5 text-sm text-slate">{contactLine}</p>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {signal ? <Chip tone="gold">{signal.short} signal</Chip> : null}
              {lead.url ? (
                <a href={lead.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-paper-tint px-2 py-0.5 text-xs text-ink transition-colors hover:bg-line">
                  {host ?? 'Source'}
                  <ExternalLink className="size-2.5 text-slate" aria-hidden="true" />
                </a>
              ) : null}
              {(lead.tags ?? []).map((t) => <Chip key={t} tone="mono">{t}</Chip>)}
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="text-label">Why this matters now</dt><dd className="mt-0.5 text-sm leading-relaxed text-ink">{lead.signalEvidence ?? 'Not set'}</dd></div>
              <div><dt className="text-label">Their words</dt><dd className="mt-0.5 text-sm leading-relaxed text-ink">{lead.verbatimQuote ?? 'No quote captured'}</dd></div>
            </dl>
          </div>

          {/* Score ring */}
          <div className="flex shrink-0 flex-col items-center gap-2 lg:items-end">
            <ScoreRing score={score.total} />
            <div className="flex items-center gap-2 text-sm">
              <VerdictWord verdict={verdict} />
              {lead.status !== 'new' && !hasReply ? <StatusWord status={lead.status} /> : null}
              {hasReply ? <StatusWord status="replied" /> : null}
            </div>
            {profiles.length > 0 ? (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-slate">Sending as</span>
                <Select className="h-8 w-auto min-w-[8rem] py-0 text-sm" value={selectedProfileId ?? ''}
                  onChange={(e) => setSelectedProfileId(e.target.value || null)} title="Profile written from">
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.platform === 'linkedin' ? 'LinkedIn' : 'Upwork'} · {p.label ?? p.headline ?? 'Unnamed'}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <Link href="/profiles" className="text-sm text-gold underline-offset-4 hover:underline">Add an identity</Link>
            )}
          </div>
        </div>

        {/* Verdict callout */}
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-paper-tint/40 px-4 py-3">
          <Award className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
          <div>
            <p className="text-sm text-ink">{verdictCall(verdict)}</p>
            {verdict === 'research_more' ? (
              <p className="mt-0.5 text-xs text-status-research">
                The record is missing {researchWhy(lead) ?? 'one more source'}. One more detail usually lifts this to a send.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* Locked / not eligible */}
      {locked ? (
        <Alert variant="destructive">
          <AlertTitle>This lead is locked</AlertTitle>
          <AlertDescription>Marked {lead.status}. No drafts or sends for anyone.</AlertDescription>
        </Alert>
      ) : null}

      {!canDraft && !locked ? (
        <div className="flex items-start gap-3 rounded-xl border border-line bg-paper-tint/40 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-research" />
          <p className="text-sm leading-relaxed text-slate">
            This lead scored {score.total}/12 and is not eligible for drafting. Go back, add more research, and it may cross the line.
          </p>
        </div>
      ) : null}

      {/* ═══ 2. PROOF MATCH (decision, not a tab) ═══ */}
      {canDraft && !locked && activeProof && (
        <section className="reveal-up stagger-1 rounded-2xl border border-line/60 bg-surface-raised p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-heading text-sm text-ink">Proof to cite</h2>
            <Link href="/profiles" className="text-xs text-gold underline-offset-4 hover:underline">Manage</Link>
          </div>
          <div className="mt-3 rounded-xl border border-gold/15 bg-gold/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {activeProof.permissionOnFile && activeProof.clientName ? activeProof.clientName : 'Client protected'}
                </p>
                {activeProof.reviewQuote && (
                  <p className="mt-1 text-xs italic text-slate">&ldquo;{activeProof.reviewQuote}&rdquo;</p>
                )}
                <p className="mt-1.5 text-xs leading-relaxed text-slate">{activeProof.projectSummary}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => onDraftProof(activeProof.id)} disabled={drafting}>
                Use this
              </Button>
            </div>
            {activeProof.tags.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1">
                {activeProof.tags.map((t) => {
                  const matches = (lead.tags ?? []).some((lt) => lt.toLowerCase() === t.toLowerCase())
                  return (
                    <span key={t} className={cn('rounded-md px-1.5 py-0.5 font-mono text-[10px]',
                      matches ? 'bg-gold/10 text-gold' : 'bg-paper-tint text-slate')}>
                      {t}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══ 3. DRAFT (visual center) ═══ */}
      {canDraft && !locked && (
        <section className="reveal-up stagger-2 space-y-4">
          <div className="rounded-2xl border border-line/60 bg-surface-raised p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-heading text-base text-ink">Draft</h2>
              {draft ? (
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                  draft.passed ? 'bg-status-send/8 text-status-send' : 'bg-status-research/8 text-status-research')}>
                  {draft.passed ? <Check className="size-3" /> : <X className="size-3" />}
                  {draft.passed ? 'Ready to send' : 'Needs an edit'}
                </span>
              ) : null}
            </div>

            {/* Artifact selector */}
            <div className="mt-4 flex flex-wrap gap-1 rounded-xl bg-paper-tint/50 p-1">
              {ARTIFACTS.map((t) => {
                const disabledHint = artifactDisabled[t.id]
                const active = artifact === t.id
                return (
                  <button key={t.id} role="tab" aria-selected={active} aria-disabled={Boolean(disabledHint)}
                    title={disabledHint ?? undefined}
                    onClick={() => { if (!disabledHint) { setOverrideCheck(false); setArtifact(t.id) } }}
                    className={cn(
                      'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all',
                      active ? 'bg-ink text-paper shadow-sm' : disabledHint ? 'cursor-not-allowed text-slate/50' : 'text-slate hover:bg-paper-tint hover:text-ink',
                    )}>
                    {t.label}
                  </button>
                )
              })}
            </div>

            {artifactDisabled[artifact] ? (
              <p className="mt-3 text-sm text-slate">{artifactDisabled[artifact]}</p>
            ) : (
              <>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button variant="gold" onClick={() => void generateDraft()} disabled={drafting || locked} loading={drafting}>
                    {drafting ? 'Drafting...' : draft ? 'Rewrite' : 'Generate draft'}
                  </Button>
                  {statusMessage ? (
                    <span className="flex items-center gap-2 text-sm text-slate">
                      <span className="size-1.5 rounded-full bg-gold gentle-pulse" />
                      {statusMessage}
                    </span>
                  ) : (
                    <span className="text-mono-medium text-xs text-slate">⌘ + Enter</span>
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
                  <div className="mt-4 rounded-xl border-2 border-ink/8 bg-paper-tint/20 p-3">
                    <Textarea
                      value={showVariant && variantDraft ? variantDraft.draftText : draftText}
                      onChange={(e) => editDraft(e.target.value)}
                      rows={6}
                      className="max-h-[28rem] overflow-y-auto border-0 bg-transparent px-0 py-1 text-[14px] leading-relaxed shadow-none focus-visible:ring-0"
                      aria-label="Draft text, editable"
                      placeholder="Your message appears here as it is written. Edit it freely."
                    />
                    <div className="mt-2 flex items-center justify-between border-t border-line/60 pt-2">
                      <span className={cn('font-mono text-xs',
                        count > countMax ? 'text-status-no' : count >= countMax * 0.9 ? 'text-status-research' : 'text-status-send')}>
                        {count} {artifactCount(artifact).label} / {countMax}
                      </span>
                      <button onClick={() => void copyDraft()}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate transition-colors hover:bg-paper-tint hover:text-ink">
                        <Copy className="size-3" /> Copy
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Self-check notes */}
                {draft?.selfCheck && !draft.passed && (
                  <div className="mt-3 space-y-1">
                    {!draft.selfCheck.test1ReplyOrDelete && (
                      <p className="text-xs text-status-research">Test 1: Would likely be deleted, not replied to.</p>
                    )}
                    {!draft.selfCheck.test2NotGeneric && (
                      <p className="text-xs text-status-research">Test 2: Too generic — would survive a company swap.</p>
                    )}
                    {!draft.selfCheck.codeChecks.companyMentioned && (
                      <p className="text-xs text-status-research">Does not name {lead.company}.</p>
                    )}
                    {!draft.selfCheck.codeChecks.specificEvidenceMentioned && (
                      <p className="text-xs text-status-research">No specific detail from the lead carried through.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ═══ 4. SEND (clearest action) ═══ */}
          <div className="rounded-2xl border border-line/60 bg-surface-raised p-5">
            <h2 className="text-heading text-base text-ink">Send it</h2>
            <p className="mt-1 text-sm text-slate">Relay never sends for you. Copy the message, send it yourself, then log what you sent.</p>

            {/* Pre-send gates */}
            {(draft || textToCheck) && (
              <div className="mt-4 space-y-1.5 rounded-xl bg-paper-tint/30 p-3">
                {gates.map((g) => (
                  <div key={g.label} className={cn('flex items-start gap-2 text-sm', g.ok ? 'text-status-send' : 'text-slate')}>
                    {g.ok
                      ? <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      : <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line" />}
                    <span>
                      {g.label}
                      {!g.ok && g.why ? <span className="block text-xs text-status-research">{g.why}</span> : null}
                    </span>
                  </div>
                ))}
                {needOverride && (
                  <label className="flex items-start gap-2.5 pt-1 text-xs text-slate">
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
              <Button variant="gold" onClick={() => void logSend()} disabled={sending || locked || !sentText.trim() || (needOverride && !overrideCheck)} loading={sending}>
                {sending ? 'Logging...' : needOverride && !overrideCheck ? 'Check the flags to log' : 'Log this send'}
              </Button>
              <span className="text-mono-medium text-xs text-slate">⌘ + Enter</span>
            </div>
            {sendError && <p className="mt-2 text-sm text-status-no" role="alert">{sendError}</p>}
            {sentOk && <p className="mt-2 text-sm text-status-send">Logged. {sentOk.todaySends} {artifact} messages sent today.</p>}
          </div>
        </section>
      )}

      {/* ═══ 5. TIMELINE (demoted, collapsible) ═══ */}
      {canDraft && !locked && (
        <section className="reveal-up stagger-3">
          <button
            type="button"
            onClick={() => setTimelineOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-xl border border-line/60 bg-surface-raised px-5 py-3 text-left transition-colors hover:bg-paper-tint/30"
          >
            <span className="text-sm font-medium text-slate">Timeline</span>
            {timelineOpen ? <ChevronUp className="size-4 text-slate" /> : <ChevronDown className="size-4 text-slate" />}
          </button>
          {timelineOpen && (
            <div className="mt-2 rounded-xl border border-line/60 bg-surface-raised p-5">
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
        <p className="mt-2 text-sm text-slate">Nothing here yet.</p>
      ) : (
        <ul className="mt-3 space-y-0">
          {[...lead.outcomes]
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
            .map((o) => (
              <li key={o.id} className="relative flex items-start gap-3 py-3">
                <div className="flex flex-col items-center">
                  <span className="size-2 rounded-full bg-gold" aria-hidden="true" />
                  <div className="w-px flex-1 bg-line" />
                </div>
                <div className="pb-3">
                  <span className="text-sm text-ink">{o.stage}</span>
                  <span className="ml-2 text-mono-medium text-xs text-slate">
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
                    <span className="text-mono-medium text-xs text-slate">
                      {m.sentAt ? `sent ${new Date(m.sentAt).toLocaleDateString()}` : `drafted ${new Date(m.createdAt).toLocaleDateString()}`}
                    </span>
                  </div>
                  {m.sentText ? <p className="mt-1 text-xs leading-relaxed text-slate">{m.sentText}</p>
                    : m.draftText ? <p className="mt-1 text-xs leading-relaxed text-slate">{m.draftText}</p> : null}
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
})

export type { SelfCheck }
