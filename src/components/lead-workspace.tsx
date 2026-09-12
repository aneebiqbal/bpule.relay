'use client'

import { memo, useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Copy, ExternalLink, X } from 'lucide-react'
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
  {
    id: 'connection',
    label: 'Connection note',
    count: { kind: 'chars', max: 300, label: 'characters' },
  },
  {
    id: 'upwork',
    label: 'Upwork letter',
    count: { kind: 'words', max: 350, label: 'words' },
  },
  {
    id: 'followup',
    label: 'Follow-up',
    count: { kind: 'words', max: 40, label: 'words' },
  },
  {
    id: 'reply',
    label: 'Reply',
    count: { kind: 'words', max: 200, label: 'words' },
  },
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
        'rounded-md px-2 py-1 text-xs',
        tone === 'mono'
          ? 'bg-paper-tint font-mono text-ink'
          : tone === 'gold'
            ? 'bg-gold/15 text-gold'
            : 'bg-paper-tint text-ink',
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
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    profiles[0]?.id ?? null,
  )
  const [proofList, setProofList] = useState<ProofItem[]>(matchedProofs)
  const [matchedProofId, setMatchedProofId] = useState<string | null>(null)
  const [variantDraft, setVariantDraft] = useState<import('@/lib/ai/draft').DraftVariant | null>(null)
  const [showVariant, setShowVariant] = useState(false)

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

  const activeProof =
    proofList.find((p) => p.id === matchedProofId) ?? proofList[0] ?? null

  const chosenProfileId = profiles.some((p) => p.id === selectedProfileId)
    ? selectedProfileId
    : profiles[0]?.id ?? null

  const editDraft = useCallback(
    (text: string) => {
      setDrafts((d) => ({
        ...d,
        [artifact]: { result: d[artifact]?.result ?? null, text },
      }))
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
        let res: Response
        try {
          res = await fetch(`/api/leads/${lead.id}/draft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: target,
              profileId: chosenProfileId,
              proofId: proofId ?? matchedProofId ?? undefined,
            }),
          })
        } catch {
          throw new Error('Network error.')
        }

        await readSse<DraftEvent>(res, {
          onEvent(event) {
            if (event.type === 'status') {
              setStatusMessage(event.message)
              return
            }
            if (event.type === 'proof') {
              setProofList(event.items)
              if (!proofId && event.items.length > 0) {
                setMatchedProofId(event.items[0].id)
              }
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
              setDrafts((d) => ({
                ...d,
                [target]: { result: d[target]?.result ?? null, text: streamBuffer.current },
              }))
              return
            }
            if (event.type === 'variant') {
              setVariantDraft(event.draft)
              return
            }
            if (event.type === 'error') {
              setDraftError(event.message)
              return
            }
            if (event.type === 'done') {
              setDrafts((d) => ({
                ...d,
                [target]: { result: event.draft, text: event.draft.draftText },
              }))
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
    try {
      await navigator.clipboard.writeText(draftText)
    } catch {
      // Clipboard unavailable; the text is already selectable in the box.
    }
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
  const priorSameType = lead.messages.some(
    (m) => m.sentText && m.sentAt && m.type === artifact,
  )
  const inPipeline = artifact === 'followup' ? !hasPriorSend : priorSameType

  const gates: Array<{ label: string; ok: boolean; why: string }> = [
    {
      label: 'Names the company',
      ok: companyNamed,
      why: companyNamed
        ? ''
        : `The message does not name ${lead.company}, so the reader cannot tell it is about them.`,
    },
    {
      label: `Within the ${ARTIFACTS.find((a) => a.id === artifact)?.label.toLowerCase()} limit`,
      ok: artifact === 'reply' || count <= countMax,
      why: count > countMax
        ? `Current text is ${count} ${countKind === 'chars' ? 'characters' : 'words'}; the limit is ${countMax}. Trim so a busy reader stays with it.`
        : '',
    },
    {
      label: 'Passed both self-checks',
      ok: Boolean(draft?.passed),
      why: !draft?.passed
        ? draft
          ? 'The draft flagged itself. Read the failing lines and fix the weakest one.'
          : 'Generate a draft first.'
        : '',
    },
    {
      label:
        artifact === 'followup' ? 'Continues an existing thread' : 'Not already sent on this line',
      ok: artifact === 'followup' ? hasPriorSend : !inPipeline,
      why:
        artifact === 'followup'
          ? !hasPriorSend
            ? 'A follow-up needs a first message on file.'
            : ''
          : inPipeline
            ? `A ${artifact} for ${lead.company} is already logged. Sending again looks like spam.`
            : '',
    },
  ]
  const allGreen =
    Boolean(draft || sentText) && textToCheck.length > 0 && gates.every((g) => g.ok)
  const needOverride = Boolean(draft || sentText) && textToCheck.length > 0 && !allGreen
  const [overrideCheck, setOverrideCheck] = useState(false)

  const nextStep = locked
    ? { title: 'This lead is locked', hint: 'No drafts or sends. Move on to the next lead.' }
    : !canDraft
      ? { title: 'Not enough here to act on', hint: 'Skip it, or go back and add more research to lift the score.' }
      : !draft && !drafting
        ? { title: 'Write the first message', hint: 'Generate a DM to open the conversation.' }
        : drafting
          ? { title: 'Writing your message', hint: statusMessage ?? 'This usually takes a few seconds.' }
          : draft && !draft.passed
            ? { title: 'Fix the draft before you send', hint: 'One check failed. Read the note below and edit.' }
            : draft && !sentText
              ? { title: 'Copy it and send it yourself', hint: 'Relay never sends for you. Paste back what you sent to log it.' }
              : !sentOk
                ? { title: 'Log the message you sent', hint: 'Confirm the text below matches, then log it.' }
                : { title: 'Sent and logged', hint: 'Follow up in a few days if there is no reply.' }

  const contactLine = lead.contactName
    ? `${lead.contactName}${lead.contactTitle ? ` · ${lead.contactTitle}` : ''}`
    : 'No contact named yet'
  const host = hostOf(lead.url)

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-paper p-6 sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-slate transition-colors hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to Today
            </Link>
            <h1 className="mt-3 text-2xl font-medium tracking-tight text-ink sm:text-3xl">
              {lead.company}
            </h1>
            <p className="mt-1 text-sm text-slate">{contactLine}</p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {signal ? <Chip>{signal.short} signal</Chip> : null}
              {lead.url ? (
                <a
                  href={lead.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-paper-tint px-2 py-1 text-xs text-ink transition-colors hover:bg-line"
                >
                  {host ?? 'Source'}
                  <ExternalLink className="size-3 text-slate" aria-hidden="true" />
                </a>
              ) : null}
              {(lead.tags ?? []).map((t) => (
                <Chip key={t} tone="mono">
                  {t}
                </Chip>
              ))}
            </div>

            <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <HeroField label="Why this matters now" value={lead.signalEvidence ?? 'Not set'} />
              <HeroField label="Their words" value={lead.verbatimQuote ?? 'No quote captured'} />
            </dl>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-3 lg:items-end">
            <ScoreRing score={score.total} />
            <div className="flex items-center gap-3 text-sm">
              <VerdictWord verdict={verdict} />
              {lead.status !== 'new' && !hasReply ? (
                <StatusWord status={lead.status} />
              ) : null}
              {hasReply ? <StatusWord status="replied" /> : null}
            </div>
            {profiles.length > 0 ? (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-slate">Sending as</span>
                <Select
                  className="h-8 w-auto min-w-[10rem] py-0 text-sm"
                  value={selectedProfileId ?? ''}
                  onChange={(e) => setSelectedProfileId(e.target.value || null)}
                  title="Profile written from"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.platform === 'linkedin' ? 'LinkedIn' : 'Upwork'} ·{' '}
                      {p.label ?? p.headline ?? p.profileUrl ?? 'Unnamed profile'}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <Link
                href="/profiles"
                className="text-sm text-slate underline-offset-4 hover:text-ink hover:underline"
              >
                Add an identity
              </Link>
            )}
          </div>
        </div>
      </section>

      {locked ? (
        <Alert variant="destructive">
          <AlertTitle>This lead is locked</AlertTitle>
          <AlertDescription>
            Marked {lead.status}. No drafts or sends for anyone. The dedupe gate keeps it out
            of the pipeline forever.
          </AlertDescription>
        </Alert>
      ) : null}

      {!canDraft && !locked ? (
        <p className="border-l-2 border-line py-1 pl-4 text-sm leading-relaxed text-slate">
          This lead scored {score.total}/12 and is not eligible for drafting. There is not
          enough here to act on. Go back, add more research, and it may cross the line.
        </p>
      ) : null}

      {canDraft && !locked ? (
        <div className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gold">
            Next step
          </span>
          <p className="mt-0.5 text-sm font-medium text-ink">{nextStep.title}</p>
          {nextStep.hint ? <p className="mt-0.5 text-xs text-slate">{nextStep.hint}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-paper p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-medium text-ink">Write the message</h2>
              {draft ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                    draft.passed
                      ? 'bg-status-send/10 text-status-send'
                      : 'bg-status-research/10 text-status-research',
                  )}
                >
                  {draft.passed ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                  {draft.passed ? 'Passed both tests' : 'Needs an edit'}
                </span>
              ) : null}
            </div>

            {!canDraft ? null : (
              <div
                className="mt-4 space-y-4"
                tabIndex={-1}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    const el = e.target as HTMLElement | null
                    if (
                      el &&
                      (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)
                    ) {
                      return
                    }
                    e.preventDefault()
                    if (artifact !== 'reply' && !locked) void generateDraft()
                  }
                }}
              >
                <div
                  role="tablist"
                  aria-label="Message artifacts"
                  className="flex flex-wrap gap-1 rounded-xl bg-paper-tint p-1"
                >
                  {ARTIFACTS.map((t) => {
                    const disabledHint = artifactDisabled[t.id]
                    const active = artifact === t.id
                    return (
                      <button
                        key={t.id}
                        role="tab"
                        aria-selected={active}
                        aria-disabled={Boolean(disabledHint)}
                        title={disabledHint ?? undefined}
                        onClick={() => {
                          if (!disabledHint) {
                            setOverrideCheck(false)
                            setArtifact(t.id)
                          }
                        }}
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                          active
                            ? 'bg-ink font-medium text-paper shadow-sm'
                            : disabledHint
                              ? 'cursor-not-allowed text-slate/60'
                              : 'text-slate hover:text-ink',
                        )}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>

                {artifactDisabled[artifact] ? (
                  <p className="text-sm leading-relaxed text-slate">{artifactDisabled[artifact]}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        variant="gold"
                        onClick={() => void generateDraft()}
                        disabled={drafting || locked}
                        loading={drafting}
                      >
                        {drafting
                          ? artifact === 'followup'
                            ? 'Drafting the follow-up'
                            : 'Drafting in your voice'
                          : draft
                            ? 'Rewrite'
                            : artifact === 'followup'
                              ? 'Generate follow-up'
                              : 'Generate draft'}
                      </Button>
                      {statusMessage ? (
                        <span className="text-sm text-slate">{statusMessage}</span>
                      ) : (
                        <span className="text-xs text-slate">Cmd / Ctrl + Enter to draft</span>
                      )}
                    </div>

                    {draftError ? (
                      <div className="space-y-2">
                        <Alert variant="destructive">
                          <AlertTitle>Draft failed</AlertTitle>
                          <AlertDescription>{draftError}</AlertDescription>
                        </Alert>
                        <Button variant="outline" size="sm" onClick={() => void generateDraft()}>
                          Try again
                        </Button>
                      </div>
                    ) : null}

                    {drafting || draft || draftText ? (
                      <DraftEditor
                        value={showVariant && variantDraft ? variantDraft.draftText : draftText}
                        onChange={editDraft}
                        artifact={artifact}
                        draft={showVariant && variantDraft ? { ...draft, draftText: variantDraft.draftText, selfCheck: variantDraft.selfCheck, passed: variantDraft.passed } as DraftResult : draft}
                        company={lead.company}
                        onCopy={copyDraft}
                        showVariant={showVariant}
                        onToggleVariant={() => setShowVariant((s) => !s)}
                        quality={
                          draft
                            ? {
                                fewShotReason: draft.fewShotReason,
                                pickReason: draft.pickReason,
                                variantAvailable: Boolean(variantDraft),
                              }
                            : null
                        }
                      />
                    ) : null}
                  </>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-paper p-6">
            <h2 className="text-base font-medium text-ink">Send it</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate">
              Relay never sends for you. Copy the message into LinkedIn or Upwork, then log the
              exact text you sent so outcomes get scored.
            </p>

            {draft || textToCheck ? (
              <div className="mt-4 space-y-1.5 border-t border-line pt-4">
                <p className="text-xs text-slate">
                  Pre-send checks, resolved as you go. Logging stays open once every line reads
                  confirmed.
                </p>
                <ul className="space-y-1">
                  {gates.map((g) => (
                    <li
                      key={g.label}
                      className={cn(
                        'flex items-start gap-2.5 text-sm',
                        g.ok ? 'text-status-send' : 'text-slate',
                      )}
                    >
                      {g.ok ? (
                        <Check className="mt-0.5 size-4 shrink-0 text-status-send" aria-hidden="true" />
                      ) : (
                        <span
                          aria-hidden
                          className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-line"
                        />
                      )}
                      <span>
                        {g.label}
                        {!g.ok && g.why ? (
                          <span className="block text-xs text-status-research">{g.why}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
                {needOverride ? (
                  <label className="flex items-start gap-2 pt-1 text-xs text-slate">
                    <input
                      type="checkbox"
                      checked={overrideCheck}
                      onChange={(e) => setOverrideCheck(e.target.checked)}
                      className="mt-0.5 accent-[--gold]"
                    />
                    <span>I read the flagged lines and will send this as written anyway.</span>
                  </label>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 grid gap-1.5">
              <Label htmlFor="sent-text">Text you actually sent</Label>
              <Textarea
                id="sent-text"
                value={sentText}
                onChange={(e) => setSentText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    if (needOverride && !overrideCheck) return
                    e.preventDefault()
                    void logSend()
                  }
                }}
                rows={5}
                disabled={locked}
                placeholder={
                  draft
                    ? 'Paste the draft above once it looks right, or paste what you typed.'
                    : 'Paste what you actually sent. No auto-send, ever.'
                }
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <Button
                variant="gold"
                onClick={() => void logSend()}
                disabled={
                  sending || locked || !sentText.trim() || (needOverride && !overrideCheck)
                }
                loading={sending}
              >
                {sending
                  ? 'Logging...'
                  : needOverride && !overrideCheck
                    ? 'Check the flags to log'
                    : 'Log this send'}
              </Button>
              <span className="text-xs text-slate">Cmd / Ctrl + Enter</span>
            </div>
            {sendError ? (
              <p className="mt-2 text-sm text-status-no" role="alert">
                {sendError}
              </p>
            ) : null}
            {sentOk ? (
              <p className="mt-2 text-sm text-status-send">
                Logged. {sentOk.todaySends} {artifact} messages sent today.
              </p>
            ) : null}
          </section>
        </div>

        <aside className="divide-y divide-line rounded-2xl border border-line bg-paper">
          <ScorePanel score={score} verdict={verdict} lead={lead} />
          <ProofPanel
            proofList={proofList}
            activeProof={activeProof}
            profiles={profiles}
            leadTags={lead.tags ?? []}
            drafting={drafting}
            onDraftProof={onDraftProof}
          />
          <Timeline lead={lead} />
        </aside>
      </div>
    </div>
  )
}

function HeroField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate">{label}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-ink">{value}</dd>
    </div>
  )
}

const ScorePanel = memo(function ScorePanel({
  score,
  verdict,
  lead,
}: {
  score: ScoreResult
  verdict: ScoreResult['verdict']
  lead: LeadDetail
}) {
  return (
    <section className="p-6">
      <h2 className="text-sm font-medium text-ink">Why this score</h2>
      <p className="mt-1 text-sm text-ink">{verdictCall(verdict)}</p>
      {verdict === 'research_more' ? (
        <p className="mt-1.5 text-xs leading-relaxed text-status-research">
          The record is missing {researchWhy(lead) ?? 'one more source'}. One more detail usually
          lifts this to a send.
        </p>
      ) : null}
      <ul className="mt-4 space-y-3 border-t border-line pt-4">
        {score.breakdown.map((item) => {
          const frac = item.max > 0 ? item.points / item.max : 0
          return (
            <li key={item.category + item.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-slate">{item.label}</span>
                <span className="font-mono text-xs text-ink">
                  {item.points}/{item.max}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-paper-tint">
                <div
                  className={cn(
                    'h-full rounded-full',
                    frac >= 1 ? 'bg-status-send' : frac > 0 ? 'bg-gold' : 'bg-line',
                  )}
                  style={{ width: `${Math.max(frac * 100, frac > 0 ? 8 : 0)}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-slate">
        7 points are the signal weight; 5 are whether the record is complete enough to act on.
      </p>
    </section>
  )
})

const ProofPanel = memo(function ProofPanel({
  proofList,
  activeProof,
  profiles,
  leadTags,
  drafting,
  onDraftProof,
}: {
  proofList: ProofItem[]
  activeProof: ProofItem | null
  profiles: Profile[]
  leadTags: string[]
  drafting: boolean
  onDraftProof: (id: string) => void
}) {
  return (
    <section className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-ink">Proof to cite</h2>
        <Link
          href="/profiles"
          className="text-xs text-slate underline-offset-4 hover:text-ink hover:underline"
        >
          Manage
        </Link>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate">
        Past work that matches this lead by tag overlap. Pick the one that wins, then draft.
      </p>
      {proofList.length === 0 ? (
        <p className="mt-3 text-sm text-slate">
          {profiles.length === 0
            ? 'No identity profiles exist yet, so nothing can be matched. Add one under Manage.'
            : 'No proof items overlap this lead yet. Add projects under Manage.'}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {proofList.map((p) => {
            const active = p.id === activeProof?.id
            return (
              <li
                key={p.id}
                className={cn(
                  'rounded-lg border p-4 transition-colors',
                  active ? 'border-gold bg-gold/5' : 'border-line bg-paper-tint/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug text-ink">
                    {p.permissionOnFile && p.clientName ? p.clientName : 'Client protected'}
                  </p>
                  <Button
                    variant={active ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => onDraftProof(p.id)}
                    disabled={drafting}
                  >
                    {active ? 'In use' : 'Use this'}
                  </Button>
                </div>
                {p.reviewQuote ? (
                  <p className="mt-1 text-xs italic text-slate">&ldquo;{p.reviewQuote}&rdquo;</p>
                ) : null}
                <p className="mt-1.5 text-xs leading-relaxed text-slate">{p.projectSummary}</p>
                {p.tags.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {p.tags.map((t) => {
                      const matches = leadTags.some(
                        (lt) => lt.toLowerCase() === t.toLowerCase(),
                      )
                      return (
                        <span
                          key={t}
                          className={cn(
                            'rounded-md px-2 py-0.5 font-mono text-[11px]',
                            matches ? 'bg-gold/15 text-ink' : 'bg-paper-tint text-slate',
                          )}
                        >
                          {t}
                        </span>
                      )
                    })}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
})

const Timeline = memo(function Timeline({ lead }: { lead: LeadDetail }) {
  return (
    <section className="p-6">
      <h2 className="text-sm font-medium text-ink">Timeline</h2>
      {lead.messages.length === 0 && lead.outcomes.length === 0 ? (
        <p className="mt-2 text-sm text-slate">Nothing here yet.</p>
      ) : (
        <ul className="mt-3 space-y-3 text-sm">
          {[...lead.outcomes]
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
            .map((o) => (
              <li key={o.id} className="flex items-baseline justify-between gap-3">
                <span className="text-ink">{o.stage}</span>
                <span className="font-mono text-xs text-slate">
                  {new Date(o.occurredAt).toLocaleDateString()}{' '}
                  {new Date(o.occurredAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          {[...lead.messages]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((m) => (
              <li key={m.id} className="space-y-0.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink">{m.type}</span>
                  <span className="font-mono text-xs text-slate">
                    {m.sentAt
                      ? `sent ${new Date(m.sentAt).toLocaleDateString()}`
                      : `drafted ${new Date(m.createdAt).toLocaleDateString()}`}
                  </span>
                </div>
                {m.sentText ? (
                  <p className="text-xs leading-relaxed text-slate">{m.sentText}</p>
                ) : m.draftText ? (
                  <p className="text-xs leading-relaxed text-slate">{m.draftText}</p>
                ) : null}
              </li>
            ))}
        </ul>
      )}
    </section>
  )
})

const DraftEditor = memo(function DraftEditor({
  value,
  onChange,
  artifact,
  draft,
  company,
  onCopy,
  showVariant,
  onToggleVariant,
  quality,
}: {
  value: string
  onChange: (v: string) => void
  artifact: ArtifactId
  draft: DraftResult | null
  company: string
  onCopy: () => void
  showVariant?: boolean
  onToggleVariant?: () => void
  quality?: {
    fewShotReason?: string
    pickReason?: string
    variantAvailable?: boolean
  } | null
}) {
  const { kind, max, label } = artifactCount(artifact)
  const count = countFor(kind, value)
  const over = count > max
  const frac = max > 0 ? count / max : 0

  return (
    <div className="space-y-3">
      {quality ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate">
            Draft quality
          </span>
          {quality.fewShotReason ? (
            <span className="text-xs text-ink">{quality.fewShotReason}</span>
          ) : null}
          {quality.pickReason ? (
            <span className="text-xs text-slate">{quality.pickReason}</span>
          ) : null}
          {quality.variantAvailable ? (
            <button
              type="button"
              onClick={onToggleVariant}
              className="ml-auto text-xs font-medium text-gold underline-offset-4 hover:underline"
            >
              {showVariant ? 'Show primary' : 'Compare variant'}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border-2 border-ink/10 bg-paper-tint/30 p-3">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={7}
          className="border-0 bg-transparent px-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
          aria-label="Draft text, editable"
          placeholder="Your message appears here as it is written. Edit it freely."
        />
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
          <span
            className={cn(
              'text-xs',
              over
                ? 'text-status-no'
                : frac >= 0.9
                  ? 'text-status-research'
                  : 'text-status-send',
            )}
          >
            {count} {label}
            {max > 0 ? ` / ${max}` : ''}
            {over ? ' · trim it so a busy reader stays' : ''}
          </span>
          <Button variant="outline" size="sm" onClick={onCopy} disabled={!value.trim()}>
            <Copy className="size-3.5" />
            Copy draft
          </Button>
        </div>
      </div>

      {draft ? (
        <div className="space-y-2 border-t border-line pt-3">
          <SelfCheckLine
            pass={draft.passed && draft.selfCheck.test1ReplyOrDelete}
            failNote="Test 1: a senior engineer would delete this."
            note={draft.selfCheck.test1Note}
          >
            A senior engineer would reply
          </SelfCheckLine>
          <SelfCheckLine
            pass={draft.passed && draft.selfCheck.test2NotGeneric}
            failNote="Test 2: swapping the company name changes nothing."
            note={draft.selfCheck.test2Note}
          >
            Would not survive a company swap
          </SelfCheckLine>

          {!draft.selfCheck.codeChecks.companyMentioned ? (
            <p className="text-xs leading-relaxed text-status-research">
              The draft does not name {company}. A stronger version writes {company} into the
              first or second line so the reader knows it is for them.
            </p>
          ) : null}
          {!draft.selfCheck.codeChecks.specificEvidenceMentioned ? (
            <p className="text-xs leading-relaxed text-status-research">
              The specific evidence was not carried through. A stronger version leads with the
              exact detail that made you reach out.
            </p>
          ) : null}

          {draft.strippedNumbers.length > 0 ? (
            <Alert variant="destructive">
              <AlertTitle>Numbers stripped by the facts guard</AlertTitle>
              <AlertDescription>
                Not in the facts table, so removed in code: {draft.strippedNumbers.join(', ')}.
              </AlertDescription>
            </Alert>
          ) : null}
          {draft.hadEmDash ? (
            <Alert variant="destructive">
              <AlertTitle>Em dash stripped</AlertTitle>
              <AlertDescription>Drafts never use em dashes. Replaced with a hyphen.</AlertDescription>
            </Alert>
          ) : null}

          <p className="text-xs text-slate">
            {draft.modelUsed}
            {draft.attempts > 1 ? ' · rewritten once after a failed self-check.' : ''}
          </p>
        </div>
      ) : null}
    </div>
  )
})

function SelfCheckLine({
  pass,
  failNote,
  note,
  children,
}: {
  pass: boolean
  failNote: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      {pass ? (
        <Check className="mt-0.5 size-4 shrink-0 text-status-send" aria-hidden="true" />
      ) : (
        <X className="mt-0.5 size-4 shrink-0 text-status-research" aria-hidden="true" />
      )}
      <div>
        <p className={pass ? 'text-sm text-status-send' : 'text-sm text-status-research'}>
          {pass ? `Passed: ${children}.` : `Failed: ${failNote}`}
        </p>
        {!pass && note && note !== 'No self-check note was produced.' ? (
          <p className="mt-0.5 text-xs text-slate">The draft&apos;s own note: {note}</p>
        ) : null}
      </div>
    </div>
  )
}

export type { SelfCheck }
