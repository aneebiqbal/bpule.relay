'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useHotkeys } from 'react-hotkeys-hook'
import {
  ArrowLeft, ChevronDown, ChevronRight, Clock, Copy, ExternalLink, Flame,
  MessageSquare, Pencil, Send, Trophy, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from 'cn'
import { ScoreRing } from '@/components/score-ring'
import { signalById } from '@/lib/score/signals'
import { computeRelationshipState } from '@/lib/relay/relationship-state'
import { evaluateDmGate, evaluateFollowupGate } from '@/lib/relay/message-eligibility'
import { readSse } from '@/lib/sse/client'
import { notifyError, notifySuccess } from '@/lib/ui/notify'
import { trackEvent } from '@/lib/analytics/tracker'
import type { LeadDetail } from '@/lib/store/types'
import type { ProofItem } from '@/lib/domain/types'
import type { DraftResult } from '@/lib/ai/draft'

// ── Types ───────────────────────────────────────────────────────────────────

interface Props {
  lead: LeadDetail
  profiles: { id: string; label: string | null; platform: string; headline: string | null }[]
}

type WorkspaceMode = 'dm' | 'connection' | 'reply' | 'followup' | 'upwork' | null

// ── Component ───────────────────────────────────────────────────────────────

export function LeadWorkspaceSimple({ lead: initialLead, profiles }: Props) {
  const searchParams = useSearchParams()
  const [lead, setLead] = useState(initialLead)
  const [leadVersion, setLeadVersion] = useState(0)

  // Profile
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(profiles[0]?.id ?? null)

  // Workspace
  const [mode, setMode] = useState<WorkspaceMode>(null)
  const [draftText, setDraftText] = useState('')
  const [draftResult, setDraftResult] = useState<DraftResult | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generationStatus, setGenerationStatus] = useState<string | null>(null)

  // Send
  const [sentText, setSentText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sentOk, setSentOk] = useState(false)

  // Panels
  const [showLogUpdate, setShowLogUpdate] = useState(false)
  const [showPasteReply, setShowPasteReply] = useState(false)
  const [capturedReplyText, setCapturedReplyText] = useState('')
  const [savingReply, setSavingReply] = useState(false)

  // Proof
  const [proofList, setProofList] = useState<ProofItem[]>([])

  // Now
  const [now, setNow] = useState(() => Date.now())

  // Refs
  const idempotencyKeyRef = useRef(crypto.randomUUID())

  // Refetch lead on version bump
  useEffect(() => {
    if (leadVersion === 0) return
    let active = true
    fetch(`/api/leads/${lead.id}`)
      .then((r) => r.json())
      .then((data) => { if (active && data.lead) setLead(data.lead) })
      .catch(() => {})
    return () => { active = false }
  }, [leadVersion, lead.id])

  // Tick now
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  // Derived
  const relationshipState = computeRelationshipState(lead, now)
  const signal = signalById(lead.signalType)
  const canonicalScore = lead.canonicalScore ?? lead.score ?? 0
  const scoreLabel = canonicalScore >= 85 ? 'Strong' : canonicalScore >= 70 ? 'Good' : canonicalScore >= 55 ? 'Fair' : 'Weak'

  // Sender profile context
  const senderProfile = profiles.find((p) => p.id === lead.senderProfileId) ?? profiles[0] ?? null
  const profileMatchPct = lead.profileMatchScore ?? null
  const hasBetterProfile = lead.bestProfileId && lead.bestProfileId !== lead.senderProfileId && lead.bestProfileMatchScore && lead.bestProfileMatchScore > (lead.profileMatchScore ?? 0)
  const betterProfile = hasBetterProfile ? profiles.find((p) => p.id === lead.bestProfileId) ?? null : null

  const dmGate = evaluateDmGate({ messages: lead.messages, connectionAcceptedAt: lead.connectionAcceptedAt })
  const followupGate = evaluateFollowupGate({
    status: lead.status, messages: lead.messages, followupCount: lead.followupCount, now,
  })

  // Generate "why" sentence for better profile
  const betterProfileReason = hasBetterProfile && betterProfile
    ? (() => {
        const diff = Math.round((lead.bestProfileMatchScore ?? 0) - (lead.profileMatchScore ?? 0))
        return `${betterProfile.label ?? 'Another profile'} is a ${diff}% stronger match than ${senderProfile?.label ?? 'current'}`
      })()
    : null
  const lastInboundMessage = lead.messages.filter((m) => m.direction === 'inbound').at(-1) ?? null

  // ── Actions ─────────────────────────────────────────────────────────────

  const generateDraft = useCallback(async (type: string) => {
    setGenerating(true)
    setGenerationStatus(null)
    setDraftText('')
    setDraftResult(null)
    let buffer = ''
    try {
      let replyText: string | undefined
      let replyToMessageId: string | undefined
      if (type === 'reply') {
        replyText = capturedReplyText || lastInboundMessage?.sentText || undefined
        replyToMessageId = lastInboundMessage?.id || undefined
      }
      const res = await fetch(`/api/leads/${lead.id}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          profileId: selectedProfileId,
          proofId: proofList[0]?.id ?? null,
          replyText,
          replyToMessageId,
        }),
      })
      await readSse<{ type: string; message?: string; items?: ProofItem[]; chunk?: string; draft?: DraftResult }>(res, {
        onEvent: (ev) => {
          if (ev.type === 'status') setGenerationStatus(ev.message ?? '')
          else if (ev.type === 'proof') setProofList(ev.items ?? [])
          else if (ev.type === 'draft') { buffer += ev.chunk ?? ''; setDraftText(buffer) }
          else if (ev.type === 'done' && ev.draft) { setDraftResult(ev.draft); setDraftText(ev.draft.draftText) }
          else if (ev.type === 'error') { setGenerationStatus(ev.message ?? ''); notifyError(ev.message ?? '') }
        },
        onError: (msg) => { setGenerationStatus(msg) },
      })
    } catch {
      setGenerationStatus('Generation failed. Retry.')
    } finally {
      setGenerating(false)
    }
  }, [lead.id, selectedProfileId, proofList, capturedReplyText, lastInboundMessage])

  const logSend = useCallback(async () => {
    const text = sentText.trim() || draftText.trim()
    if (!text) return
    setSending(true)
    setSendError(null)
    setSentOk(false)
    try {
      const res = await fetch(`/api/leads/${lead.id}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentText: text, type: mode, idempotencyKey: idempotencyKeyRef.current }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to log send.')
      setSentOk(true)
      setSentText('')
      setDraftText('')
      setDraftResult(null)
      setMode(null)
      setLeadVersion((v) => v + 1)
      // Instrument outbound sends
      const eventMap: Record<string, Parameters<typeof trackEvent>[0]['event']> = {
        connection: 'connection_sent',
        dm: 'dm_sent',
        followup: 'followup_completed',
        reply: 'reply_sent',
      }
      trackEvent({ event: eventMap[mode ?? ''] ?? 'dm_sent', leadId: lead.id })
      notifySuccess(`${mode === 'connection' ? 'Connection' : mode === 'dm' ? 'Message' : mode === 'followup' ? 'Follow-up' : 'Reply'} logged.`)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to log send.')
      notifyError('Failed to log send.')
    } finally {
      setSending(false)
    }
  }, [lead.id, sentText, draftText, mode])

  const saveReply = useCallback(async () => {
    if (!capturedReplyText.trim()) return
    setSavingReply(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: capturedReplyText.trim() }),
      })
      if (!res.ok) throw new Error('Failed to save reply.')
      setCapturedReplyText('')
      setShowPasteReply(false)
      setLeadVersion((v) => v + 1)
    } catch {
      notifyError('Failed to save reply.')
    } finally {
      setSavingReply(false)
    }
  }, [lead.id, capturedReplyText])

  const markAccepted = useCallback(async () => {
    try {
      await fetch(`/api/leads/${lead.id}/connection-accepted`, { method: 'POST' })
      setLeadVersion((v) => v + 1)
    } catch { /* non-fatal */ }
  }, [lead.id])

  const [undoAction, setUndoAction] = useState<{ label: string; onUndo: () => void } | null>(null)

  const referToProfile = useCallback(async (targetProfileId: string) => {
    const previousStatus = lead.status
    try {
      const res = await fetch(`/api/leads/${lead.id}/refer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetProfileId }),
      })
      if (!res.ok) throw new Error('Failed to refer.')
      notifySuccess('Lead referred.')
      setUndoAction({
        label: 'Lead referred',
        onUndo: async () => {
          try {
            await fetch(`/api/leads/${lead.id}/status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status_type: previousStatus === 'new' ? 'reviewed' : previousStatus }),
            })
            setLeadVersion((v) => v + 1)
            notifySuccess('Referral undone.')
          } catch {
            notifyError('Failed to undo.')
          }
        },
      })
      setLeadVersion((v) => v + 1)
    } catch {
      notifyError('Failed to refer lead.')
    }
  }, [lead.id, lead.status])

  const markNotInterested = useCallback(async () => {
    const previousStatus = lead.status
    try {
      const res = await fetch(`/api/leads/${lead.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_type: 'not_interested' }),
      })
      if (!res.ok) throw new Error('Failed to update.')
      notifySuccess('Marked not interested.')
      setUndoAction({
        label: 'Marked not interested',
        onUndo: async () => {
          try {
            await fetch(`/api/leads/${lead.id}/status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status_type: previousStatus }),
            })
            setLeadVersion((v) => v + 1)
            notifySuccess('Status restored.')
          } catch {
            notifyError('Failed to undo.')
          }
        },
      })
      setLeadVersion((v) => v + 1)
    } catch {
      notifyError('Failed to update status.')
    }
  }, [lead.id, lead.status])

  // One-click continuation from Save Lead — auto-trigger connection generation
  const hasAutoTriggered = useRef(false)
  useEffect(() => {
    if (hasAutoTriggered.current) return
    const next = searchParams.get('next')
    if (next === 'generate-connection' && relationshipState.phase === 'connection_due' && !lead.connectionAcceptedAt) {
      hasAutoTriggered.current = true
      setMode('connection')
      generateDraft('connection')
    }
  }, [searchParams, relationshipState.phase, lead.connectionAcceptedAt, generateDraft])

  // ── Render ──────────────────────────────────────────────────────────────

  // Full message history: drafts, sent, received — clearly distinguished
  const allMessages = lead.messages
    .sort((a, b) => (a.sentAt ?? a.createdAt).localeCompare(b.sentAt ?? b.createdAt))

  const sentMessages = allMessages.filter((m) => m.sentText)
  const draftMessages = allMessages.filter((m) => !m.sentText && m.draftText && m.direction !== 'inbound')

  const showFollowupOption = relationshipState.phase === 'dm_sent' && !followupGate.alreadyUsed
  const showReplyOption = relationshipState.phase === 'replied' || sentMessages.some((m) => m.direction === 'inbound')
  const showDmOption = dmGate.connectionAccepted || lead.connectionAcceptedAt

  // Keyboard shortcuts for rapid processing
  useHotkeys('g', () => {
    if (relationshipState.phase === 'connection_due' && !lead.connectionAcceptedAt) {
      setMode('connection'); generateDraft('connection')
    } else if (relationshipState.phase === 'replied') {
      setMode('reply'); generateDraft('reply')
    } else if (relationshipState.phase === 'follow_up_due') {
      setMode('followup'); generateDraft('followup')
    } else if (showDmOption && (relationshipState.phase === 'connection_accepted' || relationshipState.phase === 'dm_due')) {
      setMode('dm'); generateDraft('dm')
    }
  }, { preventDefault: true, useKey: true, enabled: relationshipState.kind === 'your_move' && !mode }, [relationshipState, mode, showDmOption, lead.connectionAcceptedAt, generateDraft])

  useHotkeys('s', () => {
    if (mode && (sentText || draftText).trim()) void logSend()
  }, { preventDefault: true, useKey: true, enabled: mode !== null && (sentText || draftText).trim().length > 0 && !sending }, [mode, sentText, draftText, sending, logSend])

  useHotkeys('escape', () => {
    if (mode) { setMode(null); setDraftText('') }
    if (showLogUpdate) setShowLogUpdate(false)
    if (showPasteReply) setShowPasteReply(false)
  }, { preventDefault: false, useKey: true }, [mode, showLogUpdate, showPasteReply])

  return (
    <div className="space-y-3 mx-auto max-w-3xl sm:space-y-4">
      {/* Undo toast */}
      {undoAction && (
        <div className="flex items-center justify-between rounded-lg border border-orange/20 bg-orange/[00.03] px-4 py-2.5">
          <span className="text-[12px] text-ink">{undoAction.label}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { undoAction.onUndo(); setUndoAction(null) }}
              className="text-[12px] font-medium text-orange hover:text-orange-light"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => setUndoAction(null)}
              className="text-stone hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <Link href="/leads" className="inline-flex items-center gap-1.5 text-[12px] text-graphite hover:text-ink">
            <ArrowLeft className="size-3.5" /> Back
          </Link>
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-[11px] text-graphite hover:text-ink">
            Today
          </Link>
        </div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-medium leading-tight text-ink sm:text-[20px]">{lead.company}</h1>
            <p className="text-[12px] text-graphite sm:text-[13px]">{lead.contactName}{lead.contactTitle ? ` · ${lead.contactTitle}` : ''}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              {senderProfile && (
                <span className="inline-flex items-center gap-1.5 text-graphite">
                  <span className="size-1.5 rounded-full bg-orange" />
                  <span className="font-medium text-ink">{senderProfile.label ?? 'Unnamed'}</span>
                  {profileMatchPct != null && (
                    <span className="text-stone">{Math.round(profileMatchPct)}% match</span>
                  )}
                </span>
              )}
              {signal && <span className="inline-flex items-center gap-1 text-orange"><Flame className="size-3" />{signal.short}</span>}
              {lead.url && (
                <a href={lead.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-graphite hover:text-ink">
                  Source <ExternalLink className="size-2.5" />
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 shrink-0">
            <ScoreRing score={lead.score} canonicalScore={lead.canonicalScore} size={40} />
            <span className="text-[10px] font-medium text-ink sm:text-[11px]">{scoreLabel}</span>
          </div>
        </div>
      </div>

      {/* Better profile recommendation — explains why */}
      {hasBetterProfile && betterProfile && betterProfileReason && (
        <div className="rounded-lg border border-orange/20 bg-orange/[0.02] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-ink">Better sender: {betterProfile.label ?? 'Unnamed'}</span>
                {lead.bestProfileMatchScore != null && profileMatchPct != null && (
                  <span className="text-[10px] font-mono text-stone">
                    {Math.round(lead.bestProfileMatchScore)}% vs {Math.round(profileMatchPct)}%
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-graphite">{betterProfileReason}.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => referToProfile(betterProfile.id)}
            >
              Refer
            </Button>
          </div>
        </div>
      )}

      {/* Relationship state — YOUR MOVE / THEIR MOVE */}
      <div className={cn(
        'rounded-lg border p-4',
        relationshipState.kind === 'your_move' ? 'border-orange/30 bg-orange/[0.03]' :
        relationshipState.kind === 'their_move' ? 'border-line bg-bone-raised/40' :
        relationshipState.kind === 'won' ? 'border-status-success/20 bg-status-success/[0.03]' :
        'border-line bg-bone-raised/30'
      )}>
        <div className="flex items-center gap-2">
          {relationshipState.kind === 'your_move' && <span className="size-2 rounded-full bg-orange animate-pulse" />}
          {relationshipState.kind === 'their_move' && <Clock className="size-3.5 text-stone" />}
          {relationshipState.kind === 'won' && <Trophy className="size-3.5 text-status-success" />}
          <span className={cn(
            'text-[12px] font-medium uppercase tracking-[0.1em]',
            relationshipState.kind === 'your_move' ? 'text-orange' :
            relationshipState.kind === 'their_move' ? 'text-stone' :
            relationshipState.kind === 'won' ? 'text-status-success' : 'text-stone'
          )}>
            {relationshipState.kind === 'your_move' ? 'Your move' : relationshipState.kind === 'their_move' ? 'Their move' : relationshipState.title}
          </span>
        </div>
        <p className="mt-1.5 text-[14px] font-medium text-ink">{relationshipState.detail}</p>
        {relationshipState.lastClientMessage && (
          <div className="mt-3 rounded-md border border-line/60 bg-bone px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-stone">They said</p>
            <p className="mt-0.5 text-[13px] text-ink leading-relaxed line-clamp-3">
              &ldquo;{relationshipState.lastClientMessage.sentText}&rdquo;
            </p>
          </div>
        )}
        {relationshipState.kind === 'their_move' && relationshipState.lastActionLabel && (
          <p className="mt-2 text-[11px] text-stone">
            {relationshipState.lastActionLabel} {relationshipState.lastActionAt && timeAgo(relationshipState.lastActionAt, now)}
          </p>
        )}
      </div>

      {/* Score breakdown — compact, always visible */}
      {(() => {
        const ci = lead.canonicalIntelligence as Record<string, unknown> | null
        const breakdown = ci?.scoreBreakdown as Record<string, unknown> | null
        const dimensions = Array.isArray(breakdown?.dimensions) ? breakdown.dimensions as Array<Record<string, unknown>> : []
        const revenue = ci?.revenue as Record<string, unknown> | null
        const noMessageReason = revenue?.noMessageReason as string | null
        if (dimensions.length === 0) return null
        return (
          <div className="rounded-lg border border-line/60 bg-bone-raised/20 px-4 py-3">
            <h2 className="text-[10px] font-medium uppercase tracking-[0.12em] text-stone mb-2">Score</h2>
            <div className="space-y-1">
              {dimensions.slice(0, 4).map((dim) => (
                <div key={dim.key as string} className="flex items-center gap-2">
                  <div className="w-16 shrink-0">
                    <div className="h-1 rounded-full bg-line/60 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange"
                        style={{ width: `${Math.min(100, ((dim.contribution as number) / ((dim.weight as number) * 100)) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-graphite shrink-0 w-20 truncate">{dim.label as string}</span>
                  <span className="text-[10px] text-stone truncate">{dim.note as string}</span>
                </div>
              ))}
            </div>
            {noMessageReason && (
              <p className="mt-2 text-[10px] text-status-warning">{noMessageReason}</p>
            )}
          </div>
        )
      })()}

      {/* Conversation history — Generated / Sent / Received */}
      {allMessages.length > 0 && (
        <div className="rounded-xl border border-line p-4">
          <h2 className="text-[12px] font-medium text-stone uppercase tracking-wider mb-3">History</h2>
          <div className="space-y-2">
            {allMessages.map((msg) => {
              const isDraft = !msg.sentText && msg.draftText && msg.direction !== 'inbound'
              const isReceived = msg.direction === 'inbound'
              return (
                <div key={msg.id} className={cn(
                  'rounded-lg border p-3',
                  isReceived ? 'border-status-success/20 bg-status-success/[0.03]' :
                  isDraft ? 'border-orange/20 bg-orange/[0.02] border-dashed' :
                  'border-line bg-bone-raised/20',
                )}>
                  <div className="flex items-center gap-2 text-[10px] text-stone">
                    {isReceived && <span className="font-medium text-status-success">← Received</span>}
                    {isDraft && <span className="font-medium text-orange">Generated draft</span>}
                    {!isReceived && !isDraft && <span>→ Sent</span>}
                    <span>·</span>
                    <span className="capitalize">{msg.type}</span>
                    {msg.sentAt && <span>· {timeAgo(msg.sentAt, now)}</span>}
                    {msg.modelUsed && isDraft && <span>· AI</span>}
                  </div>
                  <p className={cn(
                    'mt-1.5 text-[13px] leading-relaxed whitespace-pre-wrap',
                    isDraft ? 'text-graphite italic' : 'text-ink',
                  )}>
                    {msg.sentText || msg.draftText}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* PRIMARY ACTION — one clear next step */}
      <div className={cn(
        'rounded-lg p-4',
        relationshipState.kind === 'your_move' ? 'border border-orange/30 bg-bone' : 'border border-line bg-bone-raised/40'
      )}>
        <h2 className="text-[10px] font-medium text-stone uppercase tracking-[0.12em] mb-3">Next move</h2>

        {/* Single primary action based on relationship state */}
        {relationshipState.phase === 'replied' && showReplyOption && (
          <PrimaryAction
            icon={<MessageSquare className="size-5 text-orange" />}
            label={`Reply to ${lead.contactName ?? 'them'}`}
            description={relationshipState.lastClientMessage?.sentText ? `They said: "${relationshipState.lastClientMessage.sentText.slice(0, 80)}..."` : 'They wrote back — respond while it is fresh'}
            buttonText="Generate reply"
            onClick={() => { setMode('reply'); generateDraft('reply') }}
            loading={generating && mode === 'reply'}
          />
        )}

        {relationshipState.phase === 'follow_up_due' && showFollowupOption && (
          <PrimaryAction
            icon={<Send className="size-5 text-cobalt" />}
            label="Send follow-up"
            description={`No reply after 5 business days. ${3 - (lead.followupCount ?? 0)} follow-ups remaining.`}
            buttonText="Generate follow-up"
            onClick={() => { setMode('followup'); generateDraft('followup') }}
            loading={generating && mode === 'followup'}
          />
        )}

        {relationshipState.phase === 'dm_sent' && showFollowupOption && (
          <PrimaryAction
            icon={<Clock className="size-5 text-cobalt" />}
            label="Waiting for reply"
            description={`Sent ${timeAgo(relationshipState.waitingSince, now)}. ${3 - (lead.followupCount ?? 0)} follow-ups available if they go quiet.`}
            buttonText="Send follow-up now"
            onClick={() => { setMode('followup'); generateDraft('followup') }}
            loading={generating && mode === 'followup'}
          />
        )}

        {(showDmOption && (relationshipState.phase === 'connection_accepted' || relationshipState.phase === 'dm_due')) && (
          <PrimaryAction
            icon={<MessageSquare className="size-5 text-cobalt" />}
            label="Send first message"
            description="Connection accepted. Start the conversation."
            buttonText="Generate DM"
            onClick={() => { setMode('dm'); generateDraft('dm') }}
            loading={generating && mode === 'dm'}
          />
        )}

        {relationshipState.phase === 'connection_due' && !lead.connectionAcceptedAt && (
          <PrimaryAction
            icon={<Send className="size-5 text-orange" />}
            label="Send connection request"
            description="Reach out to connect. Add a note or send without one."
            buttonText="Generate note"
            onClick={() => { setMode('connection'); generateDraft('connection') }}
            loading={generating && mode === 'connection'}
            secondaryButton={(
              <Button
                variant="outline"
                size="sm"
                loading={sending}
                disabled={sending}
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/leads/${lead.id}/contact`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: 'connection', sentText: '', sendWithoutNote: true, direction: 'outbound' }),
                    })
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}))
                      notifyError(data.error ?? 'Failed to log connection.')
                    }
                    setLeadVersion((v) => v + 1)
                  } catch { /* non-fatal */ }
                }}
              >
                Send without note
              </Button>
            )}
          />
        )}

        {relationshipState.kind === 'their_move' && relationshipState.phase !== 'replied' && (
          <div className="rounded-lg border border-line bg-bone-raised/30 p-4 text-center">
            <Clock className="size-5 mx-auto text-stone" />
            <p className="mt-2 text-[14px] font-medium text-ink">Waiting on them</p>
            <p className="mt-1 text-[12px] text-graphite">{relationshipState.detail}</p>
            <div className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-center">
              <Button variant="outline" size="sm" onClick={() => setShowPasteReply(true)} className="w-full justify-center sm:w-auto">
                <MessageSquare className="size-3" /> They replied
              </Button>
              {!lead.connectionAcceptedAt && (
                <Button variant="outline" size="sm" onClick={markAccepted} className="w-full justify-center sm:w-auto">
                  <Trophy className="size-3" /> Mark accepted
                </Button>
              )}
            </div>
          </div>
        )}

        {(relationshipState.kind === 'won' || relationshipState.kind === 'lost') && (
          <div className={cn(
            'rounded-lg border p-4 text-center',
            relationshipState.kind === 'won' ? 'border-status-success/20 bg-status-success/5' : 'border-line bg-bone-raised/30',
          )}>
            <p className={cn('text-[14px] font-medium', relationshipState.kind === 'won' ? 'text-status-success' : 'text-stone')}>
              {relationshipState.kind === 'won' ? 'Opportunity won' : 'Opportunity closed'}
            </p>
            <p className="mt-1 text-[12px] text-graphite">{relationshipState.detail}</p>
          </div>
        )}
      </div>

      {/* Failure state — preserves context, offers retry */}
      {generationStatus && generationStatus.includes('failed') && !generating && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger/[0.03] p-4">
          <p className="text-[12px] font-medium text-status-danger">Generation failed</p>
          <p className="mt-1 text-[11px] text-graphite">{generationStatus}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              variant="orange"
              size="sm"
              className="w-full justify-center sm:w-auto"
              onClick={() => generateDraft(mode ?? 'connection')}
            >
              <Send className="size-3" /> Retry
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center sm:w-auto"
              onClick={() => { setGenerationStatus(null); setMode(null) }}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Secondary actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => setShowLogUpdate(true)} className="w-full justify-center sm:w-auto">
          <Pencil className="size-3" /> Log update
        </Button>
        {relationshipState.kind === 'their_move' && (
          <Button variant="ghost" size="sm" onClick={() => setShowPasteReply(true)} className="w-full justify-center sm:w-auto">
            <MessageSquare className="size-3" /> Paste reply
          </Button>
        )}
        {(relationshipState.kind === 'your_move' || relationshipState.kind === 'their_move') && lead.status !== 'won' && lead.status !== 'lost' && lead.status !== 'dead' && (
          <Button variant="ghost" size="sm" onClick={markNotInterested} className="w-full justify-center sm:w-auto text-graphite">
            <X className="size-3" /> Not interested
          </Button>
        )}
      </div>

      {/* Paste reply panel */}
      {showPasteReply && (
        <div className="rounded-xl border border-orange/20 bg-orange/[0.02] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-medium text-ink">Paste their reply</p>
            <button type="button" onClick={() => setShowPasteReply(false)} className="text-stone hover:text-ink"><X className="size-4" /></button>
          </div>
          <Textarea
            value={capturedReplyText}
            onChange={(e) => setCapturedReplyText(e.target.value)}
            rows={4}
            className="mt-3 text-[13px]"
            placeholder="Paste their message here..."
            disabled={savingReply}
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button variant="orange" size="sm" onClick={saveReply} disabled={savingReply || !capturedReplyText.trim()} loading={savingReply} className="w-full justify-center sm:w-auto">
              Save & unlock reply
            </Button>
            {capturedReplyText.trim() && (
              <Button variant="outline" size="sm" onClick={() => { saveReply().then(() => { setMode('reply'); generateDraft('reply') }) }} disabled={savingReply} className="w-full justify-center sm:w-auto">
                Save & generate reply
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Log update panel */}
      {showLogUpdate && (
        <div className="rounded-xl border border-line bg-bone p-4">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-medium text-ink">Log an update</p>
            <button type="button" onClick={() => setShowLogUpdate(false)} className="text-stone hover:text-ink"><X className="size-4" /></button>
          </div>
          <LogUpdateOptionsCompact
            phase={relationshipState.phase}
            leadId={lead.id}
            onLogged={() => { setShowLogUpdate(false); setLeadVersion((v) => v + 1) }}
          />
        </div>
      )}

      {/* Generation in progress */}
      {generating && !draftText && (
        <div className="rounded-xl border border-orange/20 bg-orange/[0.02] p-4">
          <div className="flex items-center gap-3">
            <div className="size-5 animate-spin rounded-full border-2 border-orange/30 border-t-orange" />
            <span className="text-[13px] text-ink">{generationStatus ?? 'Generating...'}</span>
          </div>
        </div>
      )}

      {/* Draft workspace */}
      {mode && draftText && (
        <div className="rounded-xl border border-line bg-bone-raised/20 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[12px] font-medium text-ink capitalize">
              {mode === 'connection' ? 'Connection note' : mode === 'dm' ? 'Your message' : mode === 'reply' ? 'Reply' : mode === 'followup' ? 'Follow-up' : 'Upwork'}
            </h2>
            <button type="button" onClick={() => { setMode(null); setDraftText('') }} className="text-stone hover:text-ink"><X className="size-4" /></button>
          </div>
          <Textarea
            value={sentText || draftText}
            onChange={(e) => setSentText(e.target.value)}
            rows={6}
            className="mt-3 text-[13px]"
            placeholder="Edit before sending..."
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="orange" size="sm" onClick={logSend} disabled={sending || !(sentText || draftText).trim()} loading={sending} className="w-full justify-center sm:w-auto">
              <Send className="size-3" /> Log as sent
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText((sentText || draftText).trim()) }} className="w-full justify-center sm:w-auto">
              <Copy className="size-3" /> Copy
            </Button>
            {sentOk && <span className="text-[11px] text-status-success">✓ Sent</span>}
            {sendError && <span className="text-[11px] text-status-danger">{sendError}</span>}
          </div>
          {generationStatus && <p className="mt-2 text-[11px] text-stone">{generationStatus}</p>}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ActionTile({ icon, label, description, onClick, loading }: {
  icon: React.ReactNode; label: string; description: string; onClick: () => void; loading?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center gap-3 rounded-lg border border-line bg-bone px-3 py-2.5 text-left transition-colors hover:border-orange/30 hover:bg-orange/[0.02] disabled:opacity-50"
    >
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        <p className="text-[11px] text-graphite truncate">{description}</p>
      </div>
      {loading ? (
        <div className="size-4 animate-spin rounded-full border-2 border-line border-t-orange" />
      ) : (
        <ChevronRight className="size-3.5 shrink-0 text-stone" />
      )}
    </button>
  )
}

function LogUpdateOptionsCompact({ phase, leadId, onLogged }: { phase: string; leadId: string; onLogged?: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [messageText, setMessageText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options: Array<{ show: string[]; label: string; value: string; needsText: boolean }> = [
    { show: ['connection_sent', 'connection_due', 'connection_accepted'], label: 'Connection accepted', value: 'connection_accepted', needsText: false },
    { show: ['dm_sent', 'waiting_for_reply', 'replied', 'follow_up_due', 'conversation'], label: 'They replied', value: 'client_replied', needsText: true },
    { show: ['connection_due', 'connection_sent', 'connection_accepted'], label: 'Sent connection', value: 'connection', needsText: true },
    { show: ['connection_accepted', 'dm_sent', 'waiting_for_reply'], label: 'Sent message', value: 'dm', needsText: true },
    { show: ['dm_sent', 'waiting_for_reply', 'replied'], label: 'Followed up', value: 'followup', needsText: true },
    { show: ['replied', 'conversation'], label: 'Sent reply', value: 'reply', needsText: true },
    { show: ['conversation', 'meeting'], label: 'Meeting booked', value: 'meeting_booked', needsText: false },
    { show: ['conversation', 'meeting', 'proposal'], label: 'Interested', value: 'interested', needsText: false },
    { show: ['conversation', 'meeting', 'proposal'], label: 'Not interested', value: 'not_interested', needsText: false },
    { show: ['*'], label: 'Something else', value: 'reviewed', needsText: false },
  ]

  const visible = options.filter((o) => o.show.includes(phase) || o.show.includes('*'))
  const selectedOpt = options.find((o) => o.value === selected)

  async function handleLog() {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      let res: Response
      if (selected === 'connection_accepted') {
        res = await fetch(`/api/leads/${leadId}/connection-accepted`, { method: 'POST' })
      } else if (selected === 'client_replied') {
        const text = messageText.trim()
        if (!text) { setError('Paste their reply.'); setSaving(false); return }
        res = await fetch(`/api/leads/${leadId}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      } else if (selectedOpt?.needsText) {
        const text = messageText.trim()
        if (!text) { setError('Paste the message text.'); setSaving(false); return }
        res = await fetch(`/api/leads/${leadId}/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: selected, sentText: text, direction: 'outbound' }) })
      } else {
        res = await fetch(`/api/leads/${leadId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status_type: selected }) })
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed.')
      setSelected(null)
      setMessageText('')
      onLogged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {visible.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setSelected(opt.value)}
          className={cn(
            'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-[12px]',
            selected === opt.value ? 'border-orange/40 bg-orange/5 text-ink' : 'border-line text-graphite hover:bg-bone-raised',
          )}
        >
          <span className={cn('size-3.5 rounded-full border flex items-center justify-center', selected === opt.value ? 'border-orange bg-orange' : 'border-line')} />
          {opt.label}
          {opt.needsText && <span className="ml-auto text-[9px] text-stone">text</span>}
        </button>
      ))}
      {selectedOpt?.needsText && (
        <Textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} rows={3} className="text-[12px]" placeholder="Paste message text..." disabled={saving} />
      )}
      {error && <p className="text-[11px] text-status-danger">{error}</p>}
      <Button variant="orange" size="sm" onClick={handleLog} disabled={saving || !selected} loading={saving}>Log this</Button>
    </div>
  )
}

function PrimaryAction({ icon, label, description, buttonText, onClick, loading, secondaryButton }: {
  icon: React.ReactNode; label: string; description: string; buttonText: string; onClick: () => void; loading?: boolean; secondaryButton?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-orange/20 bg-orange/[0.02] p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-ink">{label}</p>
          <p className="mt-1 text-[12px] text-graphite leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button variant="orange" size="sm" onClick={onClick} disabled={loading} loading={loading} className="w-full justify-center sm:w-auto">
          {buttonText}
          {!loading && <ChevronRight className="size-3" />}
        </Button>
        {secondaryButton}
      </div>
    </div>
  )
}

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return ''
  const diff = now - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
