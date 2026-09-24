'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  Handshake,
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
import { buildRevenueStrategy, describeVerdictForDisplay, sourceFromLead, toUiSnapshot } from '@/lib/relay/revenue-strategy'
import { evaluateDmGate, evaluateFollowupGate, formatCooldownRemaining } from '@/lib/relay/message-eligibility'
import { readSse } from '@/lib/sse/client'
import { notifyError } from '@/lib/ui/notify'
import { cn } from 'cn'
import type { LeadDetail } from '@/lib/store/types'
import type { Profile, ProofItem, ScoreResult } from '@/lib/domain/types'
import type { DraftResult, SelfCheck } from '@/lib/ai/draft'
import type { GenerationMode } from '@/lib/ai/routing'
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
  dmAction,
  dmMessagingPolicyLabel,
}: {
  lead: LeadDetail
  verdict: string
  hasReply: boolean
  hasPriorSend: boolean
  followupEligible: boolean
  onAction?: () => void
  /** Canonical DM-channel ContactAction — used only to keep the 'skip'
   *  fallback below from contradicting a valid non-SKIP relationship action. */
  dmAction?: string
  dmMessagingPolicyLabel?: string
}) {
  type Action = { label: string; description: string; cta: string; href?: string }
  let action: Action

  if (hasReply) {
    action = {
      label: 'Reply now',
      description: 'They wrote back. Every hour you wait lowers your chances.',
      cta: 'Open their message',
    }
  } else if (followupEligible) {
    action = {
      label: 'Follow up',
      description: 'No response yet. Up to 3 follow-ups, then move on.',
      cta: 'Open follow-up',
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
      cta: 'Open the next step',
    }
  } else if (verdict === 'research_more') {
    action = {
      label: 'Do more research',
      description: 'Promising, but not enough evidence yet. Add proof or context.',
      cta: 'Add research',
    }
  } else if (dmAction && dmAction !== 'SKIP') {
    // Verdict/action reconciliation (Bug 2): a 'skip'/low commercial
    // qualification does not by itself mean SKIP is the right action — a
    // non-buyer relationship (recruiter/partner/peer) can still have a valid
    // CONNECT_OR_OBSERVE/RESEARCH_MORE action. Never say "Not ready" /
    // "scored low, focus elsewhere" when a real action exists.
    action = {
      label: 'No current buyer fit',
      description: `Not a software-delivery buyer, but ${dmMessagingPolicyLabel?.toLowerCase() ?? 'a relationship action is recommended'}.`,
      cta: 'Review lead',
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
      'border-l-2 pl-4 py-1',
      isUrgent
        ? 'border-orange/40'
        : 'border-line',
    )}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Next best action</p>
          <p className="mt-0.5 text-[14px] font-medium text-ink">{action.label}</p>
          <p className="mt-0.5 text-[12px] text-graphite">{action.description}</p>
        </div>
        <div className="shrink-0">
          {action.href ? (
            <a
              href={action.href}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-ink hover:text-orange"
            >
              {action.cta} →
            </a>
          ) : (
            <button
              type="button"
              onClick={onAction}
              className={cn(
                'inline-flex items-center gap-2 rounded px-3 py-1.5 text-[12px] font-medium transition-all',
                isUrgent
                  ? 'bg-orange text-on-accent hover:bg-orange-dark'
                  : 'bg-solid text-on-solid hover:bg-solid/90',
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

type WorkStep = 'connection' | 'accepted' | 'message' | 'client' | 'followup' | 'upwork'

function timeAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return ''
  const diff = now - new Date(iso).getTime()
  if (Number.isNaN(diff)) return ''
  if (diff < 0) return `in ${formatCooldownRemaining(-diff)}`
  if (diff < 45_000) return 'just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return mins % 60 === 0 ? `${hrs}h ago` : `${hrs}h ${mins % 60}m ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function latestSent(messages: LeadDetail['messages'], type: LeadDetail['messages'][number]['type']) {
  return messages
    .filter((message) => message.type === type && message.sentText && message.sentAt)
    .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))[0] ?? null
}

function WorkPath({
  now,
  step,
  connectionAt,
  acceptedAt,
  messageAt,
  clientAt,
  lockUntil,
  followupWait,
  followupsLeft,
  onPick,
  onAccept,
  accepting,
  acceptError,
}: {
  now: number
  step: WorkStep
  connectionAt: string | null
  acceptedAt: string | null
  messageAt: string | null
  clientAt: string | null
  lockUntil: string | null
  followupWait: number
  followupsLeft: number
  onPick: (step: WorkStep) => void
  onAccept: () => void
  accepting: boolean
  acceptError: string | null
}) {
  const lockMs = lockUntil ? new Date(lockUntil).getTime() - now : 0
  const steps: Array<{ id: WorkStep; title: string; detail: string; done: boolean }> = [
    { id: 'connection', title: 'Connection note', detail: connectionAt ? `Logged ${timeAgo(connectionAt, now)}` : 'Write it, send it, then log it', done: Boolean(connectionAt) },
    { id: 'accepted', title: 'Invitation accepted', detail: acceptedAt ? `Accepted ${timeAgo(acceptedAt, now)}` : connectionAt ? 'Mark this when they accept on LinkedIn' : 'Opens after the note is logged', done: Boolean(acceptedAt) },
    { id: 'message', title: 'Your message', detail: messageAt ? `Logged ${timeAgo(messageAt, now)}` : 'Generate it after they accept', done: Boolean(messageAt) },
    { id: 'client', title: 'Their message', detail: clientAt ? `Saved ${timeAgo(clientAt, now)}` : 'Paste what they wrote, then write your reply', done: Boolean(clientAt) },
    { id: 'followup', title: 'Follow up', detail: followupWait > 0 ? `Wait ${formatCooldownRemaining(followupWait)}` : followupsLeft <= 0 ? 'All 3 follow-ups used' : `${followupsLeft} left`, done: followupsLeft <= 0 },
  ]

  return (
    <section className="rounded-xl border border-line bg-bone-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Work this lead</p>
          <p className="mt-1 text-[13px] text-graphite">Do one step, log it, then the next one opens.</p>
        </div>
        {lockMs > 0 && (
          <p className="inline-flex items-center gap-1.5 rounded border border-orange/30 bg-orange/5 px-2.5 py-1 text-[12px] text-ink">
            <Clock className="size-3.5 text-orange" />
            Next outreach in {formatCooldownRemaining(lockMs)}
          </p>
        )}
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {steps.map((item, index) => {
          const active = step === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                onClick={() => onPick(item.id)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  active ? 'border-orange/40 bg-orange/5' : 'border-line bg-bone hover:bg-bone-raised',
                )}
              >
                <span className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium',
                  item.done ? 'bg-status-success/15 text-status-success' : active ? 'bg-orange text-on-accent' : 'bg-bone text-stone',
                )}>
                  {item.done ? <Check className="size-3" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">{item.title}</span>
                  <span className="block text-[11px] text-graphite">{item.detail}</span>
                </span>
              </button>
              {active && item.id === 'accepted' && !acceptedAt && (
                <div className="mt-2 px-1">
                  <Button variant="orange" size="sm" onClick={onAccept} disabled={!connectionAt || accepting} loading={accepting}>
                    {accepting ? 'Saving...' : 'They accepted'}
                  </Button>
                  {!connectionAt && <p className="mt-1 text-[11px] text-graphite">Log the connection note first.</p>}
                  {acceptError && <p className="mt-1 text-[12px] text-status-danger" role="alert">{acceptError}</p>}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <button type="button" onClick={() => onPick('upwork')} className={cn('mt-2 text-[11px]', step === 'upwork' ? 'text-ink' : 'text-graphite hover:text-ink')}>
        Upwork proposal instead
      </button>
    </section>
  )
}

function LeadLoopStrip({ lead }: { lead: LeadDetail }) {
  // Channel-explicit: this strip evaluates the DM channel specifically.
  // Other surfaces (e.g. Prospect Check) may correctly show a different
  // messagingPolicy for a different channel (e.g. a connection note) for
  // the SAME lead — that is not a contradiction, it's a different
  // question. Always show messagingPolicyLabel (which names the channel-
  // appropriate action) rather than a bare "no message" that reads as a
  // universal verdict. See BUG_LEDGER — Daria Redkina / Solsonic fixture.
  const snapshot = toUiSnapshot(buildRevenueStrategy(sourceFromLead(lead, null, { channel: 'dm' })))
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-graphite">
      <span><span className="text-stone">Fit</span> {snapshot.fit}</span>
      <span><span className="text-stone">Intent</span> {snapshot.intent}</span>
      <span><span className="text-stone">Confidence</span> {snapshot.confidence}</span>
      <span><span className="text-stone">DM</span> {snapshot.messagingPolicyLabel}</span>
      {!snapshot.messageRecommended && snapshot.noMessageReason && (
        <span className="text-status-warning">{snapshot.noMessageReason}</span>
      )}
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
  // Incremented after mutations to trigger lightweight lead re-fetch
  const [leadVersion, setLeadVersion] = useState(0)
  // Local override of lead data for optimistic/targeted updates
  const [leadOverride, setLeadOverride] = useState<LeadDetail | null>(null)
  // Use override when available, otherwise server prop
  const currentLead = leadOverride || lead

  const locked = currentLead.status === 'no' || currentLead.status === 'dead'
  const verdict = currentLead.verdict ?? score.verdict

  // Verdict/action reconciliation (Bug 2): the legacy `verdict` can read
  // 'skip' (commercial qualification only) even when the canonical DM-channel
  // action is a valid non-SKIP relationship action (CONNECT_OR_OBSERVE,
  // etc). VerdictWord must not show a bare "skip" headline in that case —
  // reuse the same DM-channel snapshot LeadLoopStrip already computes so the
  // reconciliation rule lives in one place (describeVerdictForDisplay).
  const dmSnapshot = toUiSnapshot(buildRevenueStrategy(sourceFromLead(currentLead, null, { channel: 'dm' })))
  const verdictDisplay = verdict === 'skip'
    ? describeVerdictForDisplay('skip', dmSnapshot.act, dmSnapshot.messagingPolicyLabel)
    : null

  // canDraft must not be a pure qualification-score gate: a lead can score
  // 'skip' on commercial qualification alone while the revenue-strategy
  // layer independently recommends a real contact action (e.g. Fit/Intent/
  // Confidence all HIGH, action DM) — see Ran Endelman / PlexAI hardening
  // report, where a 25/100 qualification blocked drafting entirely despite
  // the strategy card recommending a DM send. Allow drafting whenever
  // either the legacy verdict OR the canonical DM-channel action says there
  // is a real reason to contact.
  const canDraft = verdict === 'send' || verdict === 'research_more' || dmSnapshot.act !== 'SKIP'

  const [artifact, setArtifact] = useState<ArtifactId>('dm')
  const [drafting, setDrafting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Partial<Record<ArtifactId, ArtifactDraftState>>>({})
  const [draftError, setDraftError] = useState<string | null>(null)
  const [sentText, setSentText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sentOk, setSentOk] = useState<{ todaySends: number } | null>(null)
  // One key per distinct send attempt (the exact text the user is about to
  // log). Reused across retries of the SAME attempt (double-click, network
  // retry) so the server can dedupe; regenerated whenever the text actually
  // changes, since that's a genuinely different send. sentTextRef mirrors
  // sentText's last value so the effect below only regenerates on real change.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  const lastKeyedTextRef = useRef<string>('')
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(profiles[0]?.id ?? null)
  const [proofList, setProofList] = useState<ProofItem[]>(matchedProofs)
  const [matchedProofId, setMatchedProofId] = useState<string | null>(null)
  const [variantDraft, setVariantDraft] = useState<import('@/lib/ai/draft').DraftVariant | null>(null)
  const [showVariant, setShowVariant] = useState(false)
  const [generationMode, setGenerationMode] = useState<GenerationMode>('standard')
  const [capturedReplyText, setCapturedReplyText] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [stepPick, setStepPick] = useState<WorkStep | null>(null)
  const [savingReply, setSavingReply] = useState(false)
  const [replySaveError, setReplySaveError] = useState<string | null>(null)

  const streamBuffer = useRef('')

  const currentDraft = drafts[artifact] ?? { result: null, text: '' }
  const draft = currentDraft.result
  const draftText = currentDraft.text

  const signal = signalById(currentLead.signalType)
  const hasReply = currentLead.messages.some((m) => m.type === 'reply' && m.sentText) || currentLead.outcomes.some((o) => o.stage === 'replied')

  const dmGate = evaluateDmGate({ messages: currentLead.messages, connectionAcceptedAt: currentLead.connectionAcceptedAt })
  const followupGate = evaluateFollowupGate({ status: currentLead.status, messages: currentLead.messages, followupCount: currentLead.followupCount })
  const hasPriorSend = followupGate.hasPriorSend
  const followupEligible = followupGate.eligible

  const artifactDisabled: Record<ArtifactId, string | null> = {
    dm: dmGate.blocked
      ? 'Waiting on the LinkedIn connection to be accepted. Mark it accepted once you see it on LinkedIn.'
      : null,
    connection: null,
    upwork: null,
    followup: followupGate.alreadyUsed
      ? 'All 3 follow-ups are used on this lead.'
      : currentLead.status === 'new'
        ? 'Eligible once this lead is contacted.'
        : !hasPriorSend
          ? 'Eligible once a first message has been sent.'
          : followupGate.inCooldown
            ? `Available in ${formatCooldownRemaining(followupGate.cooldownRemainingMs)} (6h after the last DM).`
            : null,
    reply: null,
  }

  const activeProof = proofList.find((p) => p.id === matchedProofId) ?? proofList[0] ?? null
  const chosenProfileId = profiles.some((p) => p.id === selectedProfileId) ? selectedProfileId : profiles[0]?.id ?? null
  const lastReply = currentLead.messages.filter((m) => m.type === 'reply' && m.sentText).at(-1)
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
          if (event.type === 'error') { setDraftError(event.message); notifyError(event.message, 'Draft failed'); return }
          if (event.type === 'done') { setDrafts((d) => ({ ...d, [target]: { result: event.draft, text: event.draft.draftText } })); if (event.matchedProof) setMatchedProofId(event.matchedProof.id); return }
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Drafting failed.'
      // Don't expose raw provider errors to users
      setDraftError(msg.includes('provider') || msg.includes('API key') ? 'Couldn\'t generate draft right now.' : msg)
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
    const trimmed = sentText.trim()
    // A different message text is a genuinely different send attempt — mint
    // a fresh key. The same text (a retry of this exact attempt) reuses the
    // same key so the server can recognize and dedupe the retry.
    if (trimmed !== lastKeyedTextRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID()
      lastKeyedTextRef.current = trimmed
    }
    setSending(true)
    setSendError(null)
    setSentOk(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentText: trimmed,
          type: artifact,
          originalDraft: draftText || trimmed,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to log send.')
      setSentOk({ todaySends: data.todaySends })
      setSentText('')
      // Send succeeded — clear the retry-dedup marker so a later message
      // that happens to match this same text is treated as a NEW send, not
      // mistaken for a retry of this one.
      lastKeyedTextRef.current = ''
      // Refresh lead data to update timeline, status, next action
      setLeadVersion((v) => v + 1)
      if (artifact === 'connection') setStepPick('accepted')
      else if (artifact === 'dm') setStepPick('client')
      else if (artifact === 'reply') setStepPick('followup')
      else setStepPick(null)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to log send.')
      notifyError(err instanceof Error ? err.message : 'Failed to log send.', 'Not logged')
    } finally {
      setSending(false)
    }
  }

  const [markingAccepted, setMarkingAccepted] = useState(false)
  const [markAcceptedError, setMarkAcceptedError] = useState<string | null>(null)

  async function markConnectionAccepted() {
    setMarkingAccepted(true)
    setMarkAcceptedError(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/connection-accepted`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to mark the connection accepted.')
      setLeadVersion((v) => v + 1)
      setStepPick('message')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark the connection accepted.'
      setMarkAcceptedError(message)
      notifyError(message, 'Not saved')
    } finally {
      setMarkingAccepted(false)
    }
  }

  // Re-fetch lead data after mutations (targeted, not full page reload)
  useEffect(() => {
    if (leadVersion === 0) return
    let cancelled = false
    fetch(`/api/leads/${lead.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.lead) {
          setLeadOverride(data.lead)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [leadVersion, lead.id])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])

  async function saveClientMessage() {
    const text = capturedReplyText.trim()
    if (!text) return
    setSavingReply(true)
    setReplySaveError(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not save their message.')
      if (data.lead) setLeadOverride(data.lead)
      else setLeadVersion((version) => version + 1)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save their message.'
      setReplySaveError(message)
      notifyError(message, 'Not saved')
    } finally {
      setSavingReply(false)
    }
  }

  const connectionAt = latestSent(currentLead.messages, 'connection')?.sentAt ?? null
  const messageAt = latestSent(currentLead.messages, 'dm')?.sentAt ?? null
  const clientAt = currentLead.messages
    .filter((message) => message.direction === 'inbound' && message.sentAt)
    .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))[0]?.sentAt ?? null
  const recommendedStep: WorkStep = connectionAt && !currentLead.connectionAcceptedAt
    ? 'accepted'
    : !messageAt && !connectionAt
      ? 'connection'
      : !messageAt
        ? 'message'
        : !clientAt
          ? 'client'
          : 'followup'
  const step = stepPick ?? recommendedStep
  const followupsLeft = Math.max(0, 3 - (currentLead.followupCount ?? 0))

  useEffect(() => {
    if (step === 'connection') setArtifact('connection')
    else if (step === 'message') setArtifact('dm')
    else if (step === 'client') setArtifact('reply')
    else if (step === 'followup') setArtifact('followup')
    else if (step === 'upwork') setArtifact('upwork')
  }, [step])

  const textToCheck = sentText.trim() || draftText
  const { kind: countKind, max: countMax } = artifactCount(artifact)
  const count = textToCheck ? countFor(countKind, textToCheck) : 0

  const lower = textToCheck.toLowerCase()
  const companyNamed = currentLead.company.length > 0 && lower.includes(currentLead.company.toLowerCase())
  const priorSameType = currentLead.messages.some((m) => m.sentText && m.sentAt && m.type === artifact)
  const inPipeline = artifact === 'followup' ? !hasPriorSend : priorSameType

  const gates: Array<{ label: string; ok: boolean; why: string }> = [
    { label: 'Names the company', ok: companyNamed, why: companyNamed ? '' : `Doesn't name ${currentLead.company} — reader won't know it's about them.` },
    { label: `Within the ${ARTIFACTS.find((a) => a.id === artifact)?.label.toLowerCase()} limit`, ok: artifact === 'reply' || count <= countMax, why: count > countMax ? `${count} ${countKind === 'chars' ? 'chars' : 'words'} — limit is ${countMax}.` : '' },
    { label: 'Passed every draft check', ok: Boolean(draft?.passed), why: !draft?.passed ? (draft ? 'Draft flagged itself. Read notes below.' : 'Generate a draft first.') : '' },
    { label: artifact === 'followup' ? 'Continues an existing thread' : 'Not already sent on this line', ok: artifact === 'followup' ? hasPriorSend : !inPipeline, why: artifact === 'followup' ? (!hasPriorSend ? 'A follow-up needs a first message.' : '') : (inPipeline ? `Already sent to ${currentLead.company} — looks like spam.` : '') },
  ]
  const allGreen = Boolean(draft || sentText) && textToCheck.length > 0 && gates.every((g) => g.ok)
  const needOverride = Boolean(draft || sentText) && textToCheck.length > 0 && !allGreen
  const [overrideCheck, setOverrideCheck] = useState(false)

  const contactLine = currentLead.contactName
    ? `${currentLead.contactName}${currentLead.contactTitle ? ` · ${currentLead.contactTitle}` : ''}`
    : 'No contact named yet'
  const host = hostOf(currentLead.url)

  return (
    <div className="space-y-4">

      {/* ═══ 1. WHERE THIS LEAD STANDS ═══ */}
      <section className="reveal-up space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:gap-6">
          {/* Lead info */}
          <div className="flex-1 min-w-0">
            <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-[12px] text-graphite transition-colors hover:text-ink">
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back to Today
            </Link>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {verdictDisplay?.contradicted ? (
                <span
                  role="status"
                  className="inline-flex items-center gap-2 rounded-full border border-orange/40 bg-orange/10 px-2.5 py-1 text-[12px] font-semibold text-orange shadow-sm"
                >
                  <Handshake className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="size-1.5 shrink-0 rounded-full bg-orange gentle-pulse" aria-hidden="true" />
                  {verdictDisplay.headline}
                </span>
              ) : (
                <VerdictWord verdict={verdict} />
              )}
              {currentLead.status !== 'new' && !hasReply && <StatusWord status={currentLead.status} />}
              {hasReply && <StatusWord status="replied" />}
            </div>

            <h1 className="mt-1 text-heading text-2xl text-ink sm:text-3xl">{currentLead.company}</h1>
            <p className="mt-0.5 text-sm text-graphite">{contactLine}</p>
            <LeadLoopStrip lead={currentLead} />

            {/* Tags & meta */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {signal && (
                <span className="inline-flex items-center gap-1 rounded bg-orange/8 px-1.5 py-0.5 text-[11px] font-medium text-orange">
                  <Flame className="size-3" /> {signal.short}
                </span>
              )}
              {currentLead.url && (
                <a href={currentLead.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-graphite hover:text-ink">
                  {host ?? 'Source'} <ExternalLink className="size-2.5" />
                </a>
              )}
              {(currentLead.tags ?? []).map((t) => (
                <span key={t} className="font-mono text-[11px] text-ink-soft">{t}</span>
              ))}
            </div>

            {/* Evidence — no box, just text */}
            <p className="mt-3 flex gap-2 text-[13px] leading-relaxed text-ink">
              <Target className="mt-0.5 size-3.5 shrink-0 text-orange" />
              {lead.signalEvidence || 'No signal evidence captured.'}
            </p>
            {lead.verbatimQuote && (
              <p className="mt-2 pl-5.5 text-[13px] italic text-graphite">
                &ldquo;{lead.verbatimQuote}&rdquo;
              </p>
            )}
          </div>

          {/* Score ring — right side on desktop */}
          <div className="flex shrink-0 flex-col items-center gap-2 lg:pt-1">
            <ScoreRing score={score.total} canonicalScore={currentLead.canonicalScore} size={72} />
            <p className="text-mono-medium text-[10px] text-stone">
              {currentLead.canonicalScore != null ? 'out of 10' : 'out of 12'}
            </p>
            <p className="text-[11px] font-medium text-ink">
              {currentLead.canonicalScore != null
                ? (currentLead.canonicalScore >= 85 ? 'Strong' : currentLead.canonicalScore >= 70 ? 'Good' : currentLead.canonicalScore >= 55 ? 'Fair' : 'Weak')
                : (score.total >= 10 ? 'Strong' : score.total >= 7 ? 'Good' : score.total >= 4 ? 'Fair' : 'Weak')}
            </p>
            {profiles.length > 0 ? (
              <label className="flex items-center gap-1.5 text-[11px]">
                <span className="text-graphite">As</span>
                <Select className="h-6 w-auto min-w-[6rem] py-0 text-[11px]" value={selectedProfileId ?? ''}
                  onChange={(e) => setSelectedProfileId(e.target.value || null)}>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.platform === 'linkedin' ? 'LinkedIn' : 'Upwork'} · {p.label ?? p.headline ?? 'Unnamed'}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <Link href="/profiles" className="text-[11px] text-orange underline-offset-4 hover:underline">Add identity</Link>
            )}
          </div>
        </div>

        {/* Score breakdown — collapsible, inline */}
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-1.5 text-[12px] text-graphite hover:text-ink">
            <Info className="size-3.5" />
            <span>Why this score</span>
            <ChevronDown className="ml-1 size-3 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 max-w-md">
            <ScoreBreakdown score={score} />
          </div>
        </details>
      </section>

      {/* Locked / not eligible */}
      {locked && (
        <Alert variant="destructive">
          <AlertTitle>This lead is locked</AlertTitle>
          <AlertDescription>Marked {currentLead.status}. No drafts or sends for anyone.</AlertDescription>
        </Alert>
      )}

      {!canDraft && !locked && (
        <div className="flex items-start gap-3 rounded-xl border border-line bg-bone/40 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" />
          <p className="text-sm leading-relaxed text-graphite">
            Scored {score.total}/{currentLead.canonicalScore != null ? 100 : 12} — not eligible for drafting. Add more research to push it over the line.
          </p>
        </div>
      )}

      {/* ═══ 2. PROOF MATCH ═══ */}
      {canDraft && !locked && activeProof && (
        <section className="reveal-up stagger-1 border-l-2 border-orange/30 pl-4">
          <div className="flex items-center gap-2">
            <Trophy className="size-3.5 text-orange" />
            <h2 className="text-[12px] font-medium text-ink">Proof to cite</h2>
          </div>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">
                {activeProof.permissionOnFile && activeProof.clientName ? activeProof.clientName : 'Client protected'}
              </p>
              {activeProof.reviewQuote && (
                <p className="mt-0.5 text-[12px] italic text-graphite">&ldquo;{activeProof.reviewQuote}&rdquo;</p>
              )}
              <p className="mt-1 text-[12px] leading-relaxed text-graphite">{activeProof.projectSummary}</p>
              {activeProof.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {activeProof.tags.map((t) => {
                    const matches = (currentLead.tags ?? []).some((lt) => lt.toLowerCase() === t.toLowerCase())
                    return (
                      <span key={t} className={cn('font-mono text-[10px]',
                        matches ? 'text-orange' : 'text-graphite')}>
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
        </section>
      )}

      {/* ═══ NEXT BEST ACTION ═══ */}
      {canDraft && !locked && (
        <section className="reveal-up stagger-1">
          <NextBestAction
            lead={currentLead}
            verdict={verdict}
            hasReply={hasReply}
            hasPriorSend={hasPriorSend}
            followupEligible={followupEligible}
            onAction={() => {
              if (hasReply) setStepPick('client')
              else if (followupEligible) setStepPick('followup')
              else if (connectionAt && !currentLead.connectionAcceptedAt) setStepPick('accepted')
              else if (!connectionAt) setStepPick('connection')
              else setStepPick('message')
            }}
            dmAction={dmSnapshot.act}
            dmMessagingPolicyLabel={dmSnapshot.messagingPolicyLabel}
          />
        </section>
      )}

      {canDraft && !locked && (
        <WorkPath
          now={now}
          step={step}
          connectionAt={connectionAt}
          acceptedAt={currentLead.connectionAcceptedAt ?? null}
          messageAt={messageAt}
          clientAt={clientAt}
          lockUntil={currentLead.lockedUntil ?? null}
          followupWait={followupGate.inCooldown ? followupGate.cooldownRemainingMs : 0}
          followupsLeft={followupsLeft}
          onPick={setStepPick}
          onAccept={() => void markConnectionAccepted()}
          accepting={markingAccepted}
          acceptError={markAcceptedError}
        />
      )}

      {/* ═══ 3. DRAFT ═══ */}
      {canDraft && !locked && step !== 'accepted' && (
        <section className="reveal-up stagger-2 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-heading text-base text-ink">
              {step === 'connection' ? 'Connection note' : step === 'client' ? 'Their message' : step === 'followup' ? 'Follow-up' : step === 'upwork' ? 'Upwork proposal' : 'Your message'}
            </h2>
            {draft && (
              <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium',
                draft.passed ? 'text-status-success' : 'text-status-warning')}>
                {draft.passed ? <Check className="size-3" /> : <X className="size-3" />}
                {draft.passed ? 'Ready' : 'Needs edit'}
              </span>
            )}
          </div>


            {step === 'client' && (
              <div className="mt-3 space-y-2">
                <Label htmlFor="reply-text" className="text-[11px] text-graphite">Paste what they wrote</Label>
                <Textarea id="reply-text" value={capturedReplyText} onChange={(e) => setCapturedReplyText(e.target.value)}
                  rows={3} className="mt-1 text-[13px]"
                  placeholder="Paste their message here..." />
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => void saveClientMessage()} disabled={savingReply || !capturedReplyText.trim()} loading={savingReply}>
                    {savingReply ? 'Saving...' : 'Save their message'}
                  </Button>
                  {clientAt && <span className="text-[11px] text-graphite">Saved {timeAgo(clientAt, now)}</span>}
                </div>
                {replySaveError && <p className="text-[12px] text-status-danger" role="alert">{replySaveError}</p>}
              </div>
            )}

            {artifactDisabled[artifact] ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-graphite">{artifactDisabled[artifact]}</p>
                {artifact === 'dm' && dmGate.blocked && (
                  <Button variant="outline" size="sm" onClick={() => setStepPick('accepted')}>
                    Open invitation accepted
                  </Button>
                )}
              </div>
            ) : (
              <>
                 <div className="mt-4 flex flex-wrap items-center gap-3">
                   <Button variant="orange" onClick={() => void generateDraft()} disabled={drafting || locked || (artifact === 'reply' && !prospectReplyText)} loading={drafting}>
                     {drafting ? 'Writing...' : draft ? 'Rewrite' : step === 'client' ? 'Write our reply' : 'Generate'}
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
                      <AlertTitle>Couldn&apos;t generate draft</AlertTitle>
                      <AlertDescription>{draftError}</AlertDescription>
                    </Alert>
                    <Button variant="outline" size="sm" onClick={() => void generateDraft()}>Retry</Button>
                  </div>
                )}

                {drafting || draft || draftText ? (
                  <div className="mt-3 rounded-md border border-line bg-bone p-3">
                    <Textarea
                      value={showVariant && variantDraft ? variantDraft.draftText : draftText}
                      onChange={(e) => editDraft(e.target.value)}
                      rows={6}
                      className="max-h-[28rem] overflow-y-auto border-0 bg-transparent px-0 py-1 text-[13px] leading-relaxed shadow-none focus-visible:ring-0"
                      aria-label="Draft text, editable"
                      placeholder="Your message appears here as it is written. Edit it freely."
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <span className={cn('font-mono text-[11px]',
                        count > countMax ? 'text-status-danger' : count >= countMax * 0.9 ? 'text-status-warning' : 'text-graphite')}>
                        {count} {artifactCount(artifact).label} / {countMax}
                      </span>
                      <button onClick={() => void copyDraft()}
                        className="inline-flex items-center gap-1 text-[11px] text-graphite transition-colors hover:text-ink">
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
                        <X className="mt-0.5 size-3 shrink-0" /> Does not name {currentLead.company}.
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
            </section>
          )}

          {/* ═══ 4. SEND ═══ */}
          {canDraft && !locked && step !== 'accepted' && (
          <div>
            <h2 className="text-heading text-base text-ink">Log it</h2>
            <p className="mt-0.5 text-[12px] text-graphite">Send it yourself on LinkedIn, then log the exact text. That is what starts the timer.</p>

            {/* Pre-send gates */}
            {(draft || textToCheck) && (
              <div className="mt-3 space-y-1">
                {gates.map((g) => (
                  <div key={g.label} className={cn('flex items-start gap-2 text-[12px]', g.ok ? 'text-status-success' : 'text-graphite')}>
                    {g.ok
                      ? <Check className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                      : <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line" />}
                    <span>
                      {g.label}
                      {!g.ok && g.why ? <span className="block text-[11px] text-status-warning">{g.why}</span> : null}
                    </span>
                  </div>
                ))}
                {needOverride && (
                  <label className="flex items-start gap-2 pt-1 text-[11px] text-graphite">
                    <input type="checkbox" checked={overrideCheck} onChange={(e) => setOverrideCheck(e.target.checked)} className="mt-0.5 size-3.5" />
                    <span>I read the flagged lines and will send this as written anyway.</span>
                  </label>
                )}
              </div>
            )}

            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="sent-text" className="text-[11px] text-graphite">Text you actually sent</Label>
                {draftText && (
                  <button type="button" onClick={() => setSentText(draftText)} className="text-[11px] text-orange hover:text-orange/80">
                    Use the draft
                  </button>
                )}
              </div>
              <Textarea id="sent-text" value={sentText} onChange={(e) => setSentText(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { if (needOverride && !overrideCheck) return; e.preventDefault(); void logSend() } }}
                rows={3} disabled={locked}
                placeholder={draft ? 'Paste the draft once it looks right, or paste what you typed.' : 'Paste what you actually sent. No auto-send, ever.'} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <Button variant="orange" onClick={() => void logSend()} disabled={sending || locked || !sentText.trim() || (needOverride && !overrideCheck)} loading={sending}>
                {sending ? 'Logging...' : needOverride && !overrideCheck ? 'Check the flags to log' : 'Log this'}
              </Button>
              <span className="text-mono-medium text-[10px] text-stone">⌘ + Enter</span>
            </div>
            {sendError && <p className="mt-2 text-[12px] text-status-danger" role="alert">{sendError}</p>}
             {sentOk && <p className="mt-2 text-[12px] text-status-success">Logged. {sentOk.todaySends} {artifact} messages sent today.</p>}
          </div>
      )}

      {!locked && (
        <section className="reveal-up stagger-3">
          <Timeline lead={currentLead} now={now} />
        </section>
      )}
    </div>
  )
}

function dateDayLabel(isoString: string): string {
  const d = new Date(isoString)
  const now = new Date()
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffMs = nowDay.getTime() - dDay.getTime()
  const diffDays = Math.round(diffMs / 86_400_000)
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 0) return `Today · ${timeStr}`
  if (diffDays === 1) return `Yesterday · ${timeStr}`
  if (diffDays < 7) return `${d.toLocaleDateString([], { weekday: 'long' })} · ${timeStr}`
  return `${d.toLocaleDateString()} · ${timeStr}`
}

type TimelineEvent = { id: string; kind: 'outcome' | 'message'; date: string; sortKey: string; label: string; detail?: string }

function groupByDate(events: TimelineEvent[]): Array<{ label: string; events: TimelineEvent[] }> {
  const groups: Array<{ label: string; events: TimelineEvent[] }> = []
  let currentLabel = ''
  for (const e of events) {
    const d = new Date(e.date)
    const now = new Date()
    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diffDays = Math.round((nowDay.getTime() - dDay.getTime()) / 86_400_000)
    let label: string
    if (diffDays === 0) label = 'Today'
    else if (diffDays === 1) label = 'Yesterday'
    else if (diffDays < 7) label = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
    else label = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    if (label !== currentLabel) {
      groups.push({ label, events: [e] })
      currentLabel = label
    } else {
      groups[groups.length - 1].events.push(e)
    }
  }
  return groups
}

const LOG_LABEL: Record<string, string> = {
  connection: 'Connection note',
  dm: 'Your message',
  followup: 'Follow-up',
  reply: 'Your reply',
  email: 'Email',
  upwork: 'Upwork proposal',
  replied: 'They replied',
  read: 'Read',
  check: 'Check',
  slice: 'Slice',
  close: 'Closed',
  standing: 'Standing',
}

const Timeline = memo(function Timeline({ lead, now }: { lead: LeadDetail; now: number }) {
  const events: TimelineEvent[] = [
    ...lead.outcomes.map((o) => ({ id: o.id, kind: 'outcome' as const, date: o.occurredAt, sortKey: o.occurredAt, label: LOG_LABEL[o.stage] ?? o.stage, detail: undefined })),
    ...lead.messages.filter((m) => m.sentText || m.draftText).map((m) => ({
      id: m.id,
      kind: 'message' as const,
      date: m.sentAt ?? m.createdAt,
      sortKey: m.sentAt ?? m.createdAt,
      label: m.direction === 'inbound' ? 'Their message' : (LOG_LABEL[m.type] ?? m.type),
      detail: m.sentText ?? m.draftText ?? undefined,
    })),
    ...(lead.connectionAcceptedAt ? [{
      id: `accepted-${lead.connectionAcceptedAt}`,
      kind: 'outcome' as const,
      date: lead.connectionAcceptedAt,
      sortKey: lead.connectionAcceptedAt,
      label: 'Invitation accepted',
      detail: undefined,
    }] : []),
  ].sort((a, b) => b.sortKey.localeCompare(a.sortKey))

  const groups = groupByDate(events)

  return (
    <div>
      <h2 className="text-sm font-medium text-ink">Log</h2>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-graphite">Nothing logged yet. A connection note shows up here after you log it.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">{group.label}</p>
              <ul className="mt-1 space-y-0">
                {group.events.map((e) => (
                  <li key={e.id} className="relative flex items-start gap-3 py-2">
                    <div className="flex flex-col items-center">
                      <span className={cn('size-2 rounded-full', e.kind === 'outcome' ? 'bg-orange' : 'bg-ink/20')} aria-hidden="true" />
                      <div className="w-px flex-1 bg-line" />
                    </div>
                    <div className="pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-ink">{e.label}</span>
                        <span className="text-mono-medium text-xs text-graphite">{timeAgo(e.date, now)} · {dateDayLabel(e.date)}</span>
                      </div>
                      {e.detail && <p className="mt-1 text-xs leading-relaxed text-graphite">{e.detail}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

export type { SelfCheck }
