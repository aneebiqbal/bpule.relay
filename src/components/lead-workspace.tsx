'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  Handshake,
  Info,
  MessageSquare,
  Pencil,
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
import { computeRelationshipState } from '@/lib/relay/relationship-state'
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

function artifactCount(id: ArtifactId) {
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

function LeadLoopStrip({ lead }: { lead: LeadDetail }) {
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

// ─── Relationship pipeline visualization ─────────────────────────

const PIPELINE_PHASES = [
  { id: 'connected', label: 'Connected' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'outcome', label: 'Outcome' },
] as const

function RelationshipPipeline({ phase }: { phase: string }) {
  const phaseToStep: Record<string, number> = {
    connection_due: 0, connection_sent: 0, connection_accepted: 0,
    dm_due: 1, dm_sent: 1, waiting_for_reply: 1,
    replied: 1, follow_up_due: 1, conversation: 1,
    meeting: 2, proposal: 3, won: 4, lost: 4,
  }
  const activeStep = phaseToStep[phase] ?? 0

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {PIPELINE_PHASES.map((p, i) => (
        <div key={p.id} className="flex shrink-0 items-center gap-1">
          <div className={cn(
            'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all duration-200',
            i < activeStep ? 'bg-status-success/10 text-status-success' :
            i === activeStep ? 'bg-orange/10 text-orange' :
            'bg-bone-raised text-stone',
          )}>
            {i < activeStep && <Check className="size-2.5" />}
            {p.label}
          </div>
          {i < PIPELINE_PHASES.length - 1 && (
            <ChevronRight className={cn('size-3 shrink-0', i < activeStep ? 'text-status-success/40' : 'text-line')} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Improved timeline ────────────────────────────────────────────

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

type TimelineEvent = {
  id: string
  category: 'client' | 'outbound' | 'relationship' | 'outcome' | 'system'
  date: string
  sortKey: string
  label: string
  detail?: string
}

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

const EVENT_CATEGORIES: Record<string, 'client' | 'outbound' | 'relationship' | 'outcome' | 'system'> = {
  connection: 'outbound',
  dm: 'outbound',
  followup: 'outbound',
  reply: 'outbound',
  email: 'outbound',
  upwork: 'outbound',
  replied: 'client',
  read: 'client',
  check: 'outcome',
  slice: 'outcome',
  close: 'outcome',
  standing: 'outcome',
}

const EVENT_LABELS: Record<string, string> = {
  connection: 'Connection request sent',
  dm: 'You sent a DM',
  followup: 'Follow-up sent',
  reply: 'You replied',
  email: 'Email sent',
  upwork: 'Upwork proposal sent',
  replied: 'They replied',
  read: 'Read',
  check: 'Check',
  slice: 'Slice',
  close: 'Closed',
  standing: 'Standing',
}

const Timeline = memo(function Timeline({ lead, now }: { lead: LeadDetail; now: number }) {
  const events: TimelineEvent[] = [
    ...lead.messages
      .filter((m) => m.sentText || m.draftText)
      .map((m) => ({
        id: m.id,
        category: m.direction === 'inbound' ? 'client' : (EVENT_CATEGORIES[m.type] ?? 'outbound'),
        date: m.sentAt ?? m.createdAt,
        sortKey: m.sentAt ?? m.createdAt,
        label: m.direction === 'inbound' ? 'They said' : (EVENT_LABELS[m.type] ?? m.type),
        detail: m.sentText ?? m.draftText ?? undefined,
      })),
    ...lead.outcomes
      .filter((o) => o.stage !== 'replied')
      .map((o) => ({
        id: o.id,
        category: EVENT_CATEGORIES[o.stage] ?? 'outcome',
        date: o.occurredAt,
        sortKey: o.occurredAt,
        label: EVENT_LABELS[o.stage] ?? o.stage,
        detail: undefined,
      })),
    ...(lead.connectionAcceptedAt ? [{
      id: `accepted-${lead.connectionAcceptedAt}`,
      category: 'relationship' as const,
      date: lead.connectionAcceptedAt,
      sortKey: lead.connectionAcceptedAt,
      label: 'Connection accepted',
      detail: undefined,
    }] : []),
  ].sort((a, b) => b.sortKey.localeCompare(a.sortKey))

  const groups = groupByDate(events)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (events.length === 0) {
    return (
      <div>
        <h2 className="text-sm font-medium text-ink">Activity</h2>
        <p className="mt-2 text-[13px] text-graphite">Nothing logged yet. A connection note shows up here after you log it.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-sm font-medium text-ink">Activity</h2>
      <div className="mt-3 space-y-5">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">{group.label}</p>
            <ul className="mt-1 space-y-0">
              {group.events.map((e) => (
                <li key={e.id} className="relative flex items-start gap-3 py-2">
                  <div className="flex flex-col items-center pt-1">
                    <span className={cn(
                      'size-2 rounded-full',
                      e.category === 'client' ? 'bg-cobalt' :
                      e.category === 'relationship' ? 'bg-status-success' :
                      e.category === 'outcome' ? 'bg-orange' :
                      e.category === 'outbound' ? 'bg-ink/30' :
                      'bg-line',
                    )} aria-hidden="true" />
                    <div className="w-px flex-1 bg-line" />
                  </div>
                  <div className="min-w-0 flex-1 pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] text-ink">{e.label}</span>
                      <span className="text-mono-medium text-[11px] text-graphite">{timeAgo(e.date, now)}</span>
                    </div>
                    {e.detail && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggle(e.id)}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-graphite hover:text-ink"
                        >
                          <ChevronRight className={cn('size-3 transition-transform', expanded.has(e.id) && 'rotate-90')} />
                          {expanded.has(e.id) ? 'Hide' : 'View'}
                        </button>
                        {expanded.has(e.id) && (
                          <p className="mt-1.5 rounded-md border border-line bg-bone-raised/50 p-2.5 text-[12px] leading-relaxed text-ink whitespace-pre-wrap">
                            {e.detail}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
})

// ─── Main LeadWorkspace ───────────────────────────────────────────

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
  const [leadVersion, setLeadVersion] = useState(0)
  const [leadOverride, setLeadOverride] = useState<LeadDetail | null>(null)
  const currentLead = leadOverride || lead

  const locked = currentLead.status === 'no' || currentLead.status === 'dead'
  const verdict = currentLead.verdict ?? score.verdict

  const dmSnapshot = toUiSnapshot(buildRevenueStrategy(sourceFromLead(currentLead, null, { channel: 'dm' })))
  const verdictDisplay = verdict === 'skip'
    ? describeVerdictForDisplay('skip', dmSnapshot.act, dmSnapshot.messagingPolicyLabel)
    : null

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
  const [savingReply, setSavingReply] = useState(false)
  const [replySaveError, setReplySaveError] = useState<string | null>(null)
  const [showLogUpdate, setShowLogUpdate] = useState(false)
  const [showPasteReply, setShowPasteReply] = useState(false)
  const [activeWorkspace, setActiveWorkspace] = useState<'connection' | 'dm' | 'reply' | 'followup' | 'upwork' | null>(null)

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

  const relationshipState = computeRelationshipState(currentLead, now)

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

  const connectionAt = latestSent(currentLead.messages, 'connection')?.sentAt ?? null
  const messageAt = latestSent(currentLead.messages, 'dm')?.sentAt ?? null
  const followupsLeft = Math.max(0, 3 - (currentLead.followupCount ?? 0))

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
      lastKeyedTextRef.current = ''
      setLeadVersion((v) => v + 1)
      setActiveWorkspace(null)
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark the connection accepted.'
      setMarkAcceptedError(message)
      notifyError(message, 'Not saved')
    } finally {
      setMarkingAccepted(false)
    }
  }

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
      setCapturedReplyText('')
      setShowPasteReply(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save their message.'
      setReplySaveError(message)
      notifyError(message, 'Not saved')
    } finally {
      setSavingReply(false)
    }
  }

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

  // Determine workspace from relationship phase
  useEffect(() => {
    if (activeWorkspace) return
    if (relationshipState.phase === 'connection_due' || relationshipState.phase === 'connection_sent') {
      setArtifact('connection')
    } else if (relationshipState.phase === 'connection_accepted' || relationshipState.phase === 'dm_due') {
      setArtifact('dm')
    } else if (relationshipState.phase === 'replied') {
      setArtifact('reply')
    } else if (relationshipState.phase === 'follow_up_due') {
      setArtifact('followup')
    } else if (relationshipState.phase === 'dm_sent' || relationshipState.phase === 'waiting_for_reply' || relationshipState.phase === 'conversation') {
      setArtifact('reply')
    }
  }, [relationshipState.phase, activeWorkspace])

  // Conversation messages for display
  const conversationMessages = currentLead.messages
    .filter((m) => m.sentText)
    .sort((a, b) => (a.sentAt ?? a.createdAt).localeCompare(b.sentAt ?? b.createdAt))

  return (
    <div className="space-y-6">

      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col gap-4">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-[12px] text-graphite transition-colors hover:text-ink w-fit">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to Today
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {verdictDisplay?.contradicted ? (
                <span role="status" className="inline-flex items-center gap-2 rounded-full border border-orange/40 bg-orange/10 px-2.5 py-1 text-[12px] font-semibold text-orange">
                  <Handshake className="size-3.5 shrink-0" />
                  <span className="size-1.5 shrink-0 rounded-full bg-orange gentle-pulse" />
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

            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-graphite">
              <span className="capitalize">{currentLead.source ?? 'linkedin'}</span>
              {signal && (
                <>
                  <span className="text-line">·</span>
                  <span className="inline-flex items-center gap-1 text-orange">
                    <Flame className="size-3" /> {signal.short}
                  </span>
                </>
              )}
              {currentLead.url && (
                <>
                  <span className="text-line">·</span>
                  <a href={currentLead.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-ink">
                    {host ?? 'Source'} <ExternalLink className="size-2.5" />
                  </a>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-1">
            <ScoreRing score={score.total} canonicalScore={currentLead.canonicalScore} size={64} />
            <p className="text-[11px] font-medium text-ink">
              {currentLead.canonicalScore != null
                ? (currentLead.canonicalScore >= 85 ? 'Strong' : currentLead.canonicalScore >= 70 ? 'Good' : currentLead.canonicalScore >= 55 ? 'Fair' : 'Weak')
                : (score.total >= 10 ? 'Strong' : score.total >= 7 ? 'Good' : score.total >= 4 ? 'Fair' : 'Weak')}
            </p>
            {profiles.length > 0 ? (
              <label className="flex items-center gap-1.5 text-[11px]">
                <span className="text-graphite">As</span>
                <Select className="h-6 w-auto min-w-[5rem] py-0 text-[11px]" value={selectedProfileId ?? ''}
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

        {/* Score breakdown — collapsible */}
        <details className="group text-[12px]">
          <summary className="flex cursor-pointer items-center gap-1.5 text-graphite hover:text-ink">
            <Info className="size-3.5" />
            <span>Why this score</span>
            <ChevronDown className="ml-1 size-3 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 max-w-md">
            <ScoreBreakdown score={score} />
          </div>
        </details>
      </div>

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

      {/* ═══ MAIN TWO-COLUMN LAYOUT ═══ */}
      {canDraft && !locked && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">

          {/* ── LEFT: NOW + WORK + CONVERSATION + ACTIVITY ── */}
          <div className="min-w-0 space-y-6">

            {/* NOW — Relationship state card */}
            <section className="rounded-xl border border-line bg-bone-raised/20 p-5">
              <RelationshipHeader state={relationshipState} contactName={currentLead.contactName} />

              <div className="mt-3">
                <RelationshipPipeline phase={relationshipState.phase} />
              </div>

              {/* Your Move */}
              {relationshipState.kind === 'your_move' && (
                <div className="mt-4 rounded-lg border border-orange/20 bg-orange/[0.03] p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-orange">
                    <span className="size-1.5 rounded-full bg-orange gentle-pulse" />
                    Your move
                  </div>
                  <p className="mt-2 text-[15px] font-medium text-ink">{relationshipState.title}</p>
                  <p className="mt-1 text-[13px] text-graphite">{relationshipState.detail}</p>
                  {relationshipState.lastClientMessage && relationshipState.phase === 'replied' && (
                    <div className="mt-3 rounded-md border border-line bg-bone p-3">
                      <p className="text-[10px] text-stone">They said</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink line-clamp-3">
                        &ldquo;{relationshipState.lastClientMessage.sentText}&rdquo;
                      </p>
                    </div>
                  )}
                  <div className="mt-3">
                    <Button variant="orange" size="sm" onClick={() => {
                      if (relationshipState.phase === 'replied') { setArtifact('reply'); setActiveWorkspace('reply') }
                      else if (relationshipState.phase === 'follow_up_due') { setArtifact('followup'); setActiveWorkspace('followup') }
                      else if (relationshipState.phase === 'connection_accepted' || relationshipState.phase === 'dm_due') { setArtifact('dm'); setActiveWorkspace('dm') }
                      else { setArtifact('connection'); setActiveWorkspace('connection') }
                    }}>
                      {relationshipState.primaryCta}
                      <ArrowRight className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Their Move */}
              {relationshipState.kind === 'their_move' && (
                <div className="mt-4 rounded-lg border border-line bg-bone-raised/30 p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-stone">
                    <Clock className="size-3" />
                    Their move
                  </div>
                  <p className="mt-2 text-[15px] font-medium text-ink">
                    Waiting for {relationshipState.waitingOn === 'connection' ? currentLead.contactName ?? 'them' : currentLead.contactName ?? 'them'}
                  </p>
                  {relationshipState.lastActionLabel && (
                    <p className="mt-1 text-[13px] text-graphite">
                      {relationshipState.lastActionLabel}{relationshipState.lastActionAt ? ` · ${timeAgo(relationshipState.lastActionAt, now)}` : ''}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-stone">No action needed right now.</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPasteReply(true)}
                    >
                      <MessageSquare className="size-3.5" />
                      They replied
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowLogUpdate(true)}>
                      <Pencil className="size-3.5" />
                      Log an update
                    </Button>
                  </div>
                </div>
              )}

              {/* Terminal */}
              {(relationshipState.kind === 'won' || relationshipState.kind === 'lost') && (
                <div className={cn(
                  'mt-4 rounded-lg border p-4',
                  relationshipState.kind === 'won' ? 'border-status-success/20 bg-status-success/5' : 'border-line bg-bone-raised/50',
                )}>
                  <p className={cn(
                    'text-[10px] font-medium uppercase tracking-[0.12em]',
                    relationshipState.kind === 'won' ? 'text-status-success' : 'text-stone',
                  )}>
                    {relationshipState.kind === 'won' ? 'Opportunity won' : 'Opportunity lost'}
                  </p>
                  <p className="mt-1.5 text-[13px] text-graphite">{relationshipState.detail}</p>
                </div>
              )}
            </section>

            {/* Paste reply panel */}
            {showPasteReply && (
              <section className="rounded-xl border border-line bg-bone p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="size-4 text-orange" />
                    <p className="text-[12px] font-medium text-ink">Did they reply?</p>
                  </div>
                  <button type="button" onClick={() => setShowPasteReply(false)} className="text-[11px] text-graphite hover:text-ink">
                    <X className="size-4" />
                  </button>
                </div>
                <Textarea
                  value={capturedReplyText}
                  onChange={(e) => setCapturedReplyText(e.target.value)}
                  rows={4}
                  className="mt-3 text-[13px]"
                  placeholder="Paste their message here..."
                  disabled={savingReply}
                />
                {replySaveError && <p className="mt-2 text-[12px] text-status-danger" role="alert">{replySaveError}</p>}
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="orange" size="sm" onClick={() => void saveClientMessage()} disabled={savingReply || !capturedReplyText.trim()} loading={savingReply}>
                    Save Reply
                  </Button>
                </div>
              </section>
            )}

            {/* Log update panel */}
            {showLogUpdate && (
              <section className="rounded-xl border border-line bg-bone p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Pencil className="size-4 text-stone" />
                    <p className="text-[12px] font-medium text-ink">Log an update</p>
                  </div>
                  <button type="button" onClick={() => setShowLogUpdate(false)} className="text-[11px] text-graphite hover:text-ink">
                    <X className="size-4" />
                  </button>
                </div>
                <LogUpdateOptions
                  phase={relationshipState.phase}
                  leadId={lead.id}
                  onLogged={() => { setShowLogUpdate(false); setLeadVersion((v) => v + 1) }}
                />
              </section>
            )}

            {/* Workspace: draft + send */}
            {activeWorkspace && (
              <section className="space-y-4 rounded-xl border border-line bg-bone-raised/20 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[14px] font-medium text-ink">
                    {activeWorkspace === 'connection' ? 'Connection note' :
                     activeWorkspace === 'dm' ? 'Your message' :
                     activeWorkspace === 'reply' ? 'Reply' :
                     activeWorkspace === 'followup' ? 'Follow-up' : 'Upwork proposal'}
                  </h2>
                  <button type="button" onClick={() => setActiveWorkspace(null)} className="text-[11px] text-graphite hover:text-ink">
                    Close
                  </button>
                </div>

                {/* Proof match */}
                {activeProof && (activeWorkspace === 'dm' || activeWorkspace === 'connection' || activeWorkspace === 'followup') && (
                  <div className="border-l-2 border-orange/30 pl-4 py-2">
                    <div className="flex items-center gap-2">
                      <Trophy className="size-3.5 text-orange" />
                      <p className="text-[12px] font-medium text-ink">Proof to cite</p>
                    </div>
                    <p className="mt-1 text-[13px] text-ink">
                      {activeProof.permissionOnFile && activeProof.clientName ? activeProof.clientName : 'Client protected'}
                    </p>
                    {activeProof.reviewQuote && (
                      <p className="mt-0.5 text-[12px] italic text-graphite">&ldquo;{activeProof.reviewQuote}&rdquo;</p>
                    )}
                    <Button variant="orange" size="xs" onClick={() => onDraftProof(activeProof.id)} disabled={drafting} className="mt-2">
                      Use this
                    </Button>
                  </div>
                )}

                {/* Generate */}
                {artifactDisabled[artifact] ? (
                  <div className="py-2">
                    <p className="text-[13px] text-graphite">{artifactDisabled[artifact]}</p>
                    {artifact === 'dm' && dmGate.blocked && (
                      <Button variant="outline" size="sm" onClick={() => void markConnectionAccepted()} disabled={!connectionAt || markingAccepted} loading={markingAccepted} className="mt-2">
                        Mark connection accepted
                      </Button>
                    )}
                    {markAcceptedError && <p className="mt-1 text-[12px] text-status-danger" role="alert">{markAcceptedError}</p>}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="orange" size="sm" onClick={() => void generateDraft()} disabled={drafting || (artifact === 'reply' && !prospectReplyText)} loading={drafting}>
                        {drafting ? 'Writing...' : draft ? 'Rewrite' : 'Generate'}
                      </Button>
                      <GenerationModeSelector value={generationMode} onChange={setGenerationMode} compact />
                      {statusMessage && (
                        <span className="flex items-center gap-2 text-[13px] text-graphite">
                          <span className="size-1.5 rounded-full bg-orange gentle-pulse" />
                          {statusMessage}
                        </span>
                      )}
                    </div>

                    {draftError && (
                      <Alert variant="destructive" className="mt-3">
                        <AlertTitle>Couldn&apos;t generate draft</AlertTitle>
                        <AlertDescription>{draftError}</AlertDescription>
                      </Alert>
                    )}

                    {(drafting || draft || draftText) && (
                      <div className="mt-3 rounded-md border border-line bg-bone p-3">
                        <Textarea
                          value={showVariant && variantDraft ? variantDraft.draftText : draftText}
                          onChange={(e) => editDraft(e.target.value)}
                          rows={6}
                          className="max-h-[28rem] overflow-y-auto border-0 bg-transparent px-0 py-1 text-[13px] leading-relaxed shadow-none focus-visible:ring-0"
                          placeholder="Your message appears here as it is written. Edit it freely."
                        />
                        <div className="mt-2 flex items-center justify-between">
                          <span className={cn('font-mono text-[11px]',
                            count > countMax ? 'text-status-danger' : count >= countMax * 0.9 ? 'text-status-warning' : 'text-graphite')}>
                            {count} {artifactCount(artifact).label} / {countMax}
                          </span>
                          <button onClick={() => void copyDraft()} className="inline-flex items-center gap-1 text-[11px] text-graphite hover:text-ink">
                            <Copy className="size-3" /> Copy
                          </button>
                        </div>
                      </div>
                    )}

                    {draft && !draft.passed && (
                      <div className="mt-3 space-y-1">
                        {!draft.selfCheck.test1ReplyOrDelete && (
                          <p className="flex items-start gap-2 text-[12px] text-status-warning">
                            <X className="mt-0.5 size-3 shrink-0" /> Would likely be deleted, not replied to.
                          </p>
                        )}
                        {!draft.selfCheck.test2NotGeneric && (
                          <p className="flex items-start gap-2 text-[12px] text-status-warning">
                            <X className="mt-0.5 size-3 shrink-0" /> Too generic.
                          </p>
                        )}
                        {!draft.selfCheck.codeChecks.companyMentioned && (
                          <p className="flex items-start gap-2 text-[12px] text-status-warning">
                            <X className="mt-0.5 size-3 shrink-0" /> Does not name {currentLead.company}.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Log it */}
                {!artifactDisabled[artifact] && (
                  <div className="mt-4 border-t border-line pt-4">
                    <h3 className="text-[13px] font-medium text-ink">Log it</h3>
                    <p className="mt-0.5 text-[12px] text-graphite">Send it yourself on LinkedIn, then log the exact text.</p>

                    {(draft || textToCheck) && (
                      <div className="mt-3 space-y-1">
                        {gates.map((g) => (
                          <div key={g.label} className={cn('flex items-start gap-2 text-[12px]', g.ok ? 'text-status-success' : 'text-graphite')}>
                            {g.ok
                              ? <Check className="mt-0.5 size-3 shrink-0" />
                              : <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line" />}
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
                      <Label htmlFor="sent-text" className="text-[11px] text-graphite">Text you actually sent</Label>
                      <Textarea
                        id="sent-text"
                        value={sentText}
                        onChange={(e) => setSentText(e.target.value)}
                        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { if (needOverride && !overrideCheck) return; e.preventDefault(); void logSend() } }}
                        rows={3}
                        placeholder={draft ? 'Paste the draft once it looks right.' : 'Paste what you actually sent. No auto-send, ever.'}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <Button variant="orange" size="sm" onClick={() => void logSend()} disabled={sending || !sentText.trim() || (needOverride && !overrideCheck)} loading={sending}>
                        {sending ? 'Logging...' : needOverride && !overrideCheck ? 'Check the flags to log' : 'Log this'}
                      </Button>
                      <span className="text-mono-medium text-[10px] text-stone">⌘ + Enter</span>
                    </div>
                    {sendError && <p className="mt-2 text-[12px] text-status-danger" role="alert">{sendError}</p>}
                    {sentOk && <p className="mt-2 text-[12px] text-status-success">Logged. {sentOk.todaySends} messages sent today.</p>}
                  </div>
                )}
              </section>
            )}

            {/* CONVERSATION */}
            {conversationMessages.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-ink">Conversation</h2>
                <div className="mt-3 space-y-2">
                  {conversationMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'rounded-lg border p-3',
                        msg.direction === 'inbound'
                          ? 'border-cobalt/20 bg-cobalt/[0.03]'
                          : 'border-line bg-bone-raised/30',
                      )}
                    >
                      <div className="flex items-center gap-2 text-[10px] text-stone">
                        <span className={cn(
                          'font-medium',
                          msg.direction === 'inbound' ? 'text-cobalt' : 'text-graphite',
                        )}>
                          {msg.direction === 'inbound' ? currentLead.contactName ?? 'They' : 'You'}
                        </span>
                        <span>·</span>
                        <span>{timeAgo(msg.sentAt, now)}</span>
                        <span>·</span>
                        <span className="capitalize">{msg.type}</span>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
                        {msg.sentText}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ACTIVITY */}
            <section>
              <Timeline lead={currentLead} now={now} />
            </section>
          </div>

          {/* ── RIGHT: RELATIONSHIP CONTEXT ── */}
          <aside className="space-y-4">
            <div className="rounded-xl border border-line bg-bone-raised/10 p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Relationship</p>
              <dl className="mt-3 space-y-3">
                <div>
                  <dt className="text-[11px] text-stone">Current stage</dt>
                  <dd className="mt-0.5 text-[13px] font-medium text-ink capitalize">{relationshipState.phase.replace(/_/g, ' ')}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-stone">Channel</dt>
                  <dd className="mt-0.5 text-[13px] text-ink capitalize">{currentLead.source ?? 'linkedin'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-stone">Fit</dt>
                  <dd className="mt-0.5 text-[13px] text-ink">{dmSnapshot.fit}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-stone">Intent</dt>
                  <dd className="mt-0.5 text-[13px] text-ink">{dmSnapshot.intent}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-stone">Confidence</dt>
                  <dd className="mt-0.5 text-[13px] text-ink">{dmSnapshot.confidence}</dd>
                </div>
                {followupsLeft < 3 && (
                  <div>
                    <dt className="text-[11px] text-stone">Follow-ups used</dt>
                    <dd className="mt-0.5 text-[13px] text-ink">{3 - followupsLeft} of 3</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Signal evidence */}
            {lead.signalEvidence && (
              <div className="rounded-xl border border-line bg-bone-raised/10 p-4">
                <div className="flex items-center gap-1.5">
                  <Target className="size-3.5 text-orange" />
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Signal</p>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink">{lead.signalEvidence}</p>
                {lead.verbatimQuote && (
                  <p className="mt-2 text-[12px] italic text-graphite">&ldquo;{lead.verbatimQuote}&rdquo;</p>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────

function RelationshipHeader({ state, contactName }: { state: ReturnType<typeof computeRelationshipState>; contactName?: string | null }) {
  const isYourMove = state.kind === 'your_move'
  const isTerminal = state.kind === 'won' || state.kind === 'lost'
  const label = isTerminal ? (state.kind === 'won' ? 'Won' : 'Lost') :
    isYourMove ? 'Your move' : 'Their move'

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
          state.kind === 'won' ? 'bg-status-success/10 text-status-success' :
          state.kind === 'lost' ? 'bg-bone-raised text-stone' :
          isYourMove ? 'bg-orange/10 text-orange' :
          'bg-bone-raised text-stone',
        )}>
          {isYourMove && <span className="size-1.5 rounded-full bg-orange gentle-pulse" />}
          {label}
        </span>
        {state.lastActionLabel && (
          <span className="text-[11px] text-graphite">{state.lastActionLabel}</span>
        )}
      </div>
      {state.lastActionAt && (
        <span className="text-[11px] text-stone">{timeAgo(state.lastActionAt, Date.now())}</span>
      )}
    </div>
  )
}

function timeAgoInline(iso: string | null, now: number): string {
  return timeAgo(iso, now)
}

function LogUpdateOptions({ phase, leadId, onLogged }: { phase: string; leadId: string; onLogged?: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options: Array<{ show: string[]; label: string; value: string }> = [
    { show: ['connection_sent', 'connection_due', 'connection_accepted'], label: 'They accepted my connection', value: 'connection_accepted' },
    { show: ['dm_sent', 'waiting_for_reply', 'replied', 'follow_up_due', 'conversation'], label: 'They replied', value: 'client_replied' },
    { show: ['connection_due', 'connection_sent', 'connection_accepted'], label: 'I sent a connection request', value: 'connection_sent' },
    { show: ['connection_accepted', 'dm_sent', 'waiting_for_reply'], label: 'I sent a message', value: 'dm_sent' },
    { show: ['conversation', 'meeting'], label: 'Meeting booked', value: 'meeting_booked' },
    { show: ['conversation', 'meeting', 'proposal'], label: 'They are interested', value: 'interested' },
    { show: ['conversation', 'meeting', 'proposal'], label: 'Not interested', value: 'not_interested' },
    { show: ['dm_sent', 'waiting_for_reply'], label: 'No response yet', value: 'no_response' },
    { show: ['*'], label: 'Something else', value: 'other' },
  ]

  const visible = options.filter((o) => o.show.includes(phase) || o.show.includes('*'))

  async function handleLog() {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      let res: Response
      if (selected === 'connection_accepted') {
        res = await fetch(`/api/leads/${leadId}/connection-accepted`, { method: 'POST' })
      } else {
        res = await fetch(`/api/leads/${leadId}/contact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: selected, sentText: '', direction: 'inbound' }),
        })
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not log update.')
      setSelected(null)
      onLogged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log update.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 space-y-1">
      {visible.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setSelected(opt.value)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-[13px] transition-all duration-150',
            selected === opt.value
              ? 'border-orange/40 bg-orange/5 text-ink'
              : 'border-line bg-bone-raised/50 text-graphite hover:bg-bone-raised hover:text-ink',
          )}
        >
          <span className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-full border transition-all',
            selected === opt.value ? 'border-orange bg-orange' : 'border-line bg-bone',
          )}>
            {selected === opt.value && <Check className="size-2.5 text-on-accent" />}
          </span>
          {opt.label}
        </button>
      ))}
      {error && <p className="mt-2 text-[12px] text-status-danger" role="alert">{error}</p>}
      <div className="mt-2 flex items-center gap-2">
        <Button variant="orange" size="sm" onClick={() => void handleLog()} disabled={saving || !selected} loading={saving}>
          Log this
        </Button>
      </div>
    </div>
  )
}

export type { SelfCheck }
