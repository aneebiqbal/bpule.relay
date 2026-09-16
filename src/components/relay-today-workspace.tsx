'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import { cn } from 'cn'

type ActionKind =
  | 'reply_needed'
  | 'followup_due'
  | 'high_fit_lead'
  | 'new_opportunity'
  | 'job_worth_apply'
  | 'proposal_ready'
  | 'lead_going_cold'
  | 'content_opportunity'
  | 'admin_review'
  | 'inbound_opportunity'

export interface RelayTodayAction {
  id: string
  kind: ActionKind
  priority: 'urgent' | 'high' | 'medium' | 'low'
  title: string
  subtitle: string
  href: string
  whatHappened: string
  whyItMatters: string
  whyLines: string[]
  prepared: string | null
  humanAction: string
  createdAt: string
  fitScore: number | null
  identity: {
    id: string | null
    name: string
    title: string | null
    channel: string | null
  } | null
  proof: string | null
  inbound: boolean
}

export interface RelayTodayWorkspaceProps {
  generatedAt: string
  role: 'admin' | 'rep' | 'sourcer'
  actions: RelayTodayAction[]
  system: {
    conversationsActive: number
    conversationsNeedReply: number
    opportunitiesQualified: number
    opportunitiesStrong: number
    followupsDue: number
    jobsWorthReview: number
    studioIdeasReady: number
  }
  conversationsMoving: Array<{
    id: string
    name: string
    signal: string
    next: string
    href: string
  }>
  opportunities: Array<{
    id: string
    name: string
    fit: number | null
    why: string[]
    href: string
  }>
  studioOpportunity: {
    title: string
    whyYou: string
    href: string
  } | null
  targetProgress: {
    completed: number
    total: number
    remaining: number
    status: 'on_track' | 'at_risk' | 'completed' | 'missed'
  } | null
  adminSummary: {
    teamRows: Array<{
      id: string
      name: string
      completed: number
      target: number
      remaining: number
      status: 'on_track' | 'at_risk' | 'completed' | 'missed'
    }>
    attentionItems: Array<{
      id: string
      title: string
      detail: string
      severity: 'warning' | 'critical'
    }>
    activeConversations: number
    highIntent: number
    onTrackCount: number
    totalReps: number
  } | null
}

const DAILY_KEY_PREFIX = 'relay-today-state'

export function RelayTodayWorkspace({
  generatedAt,
  role,
  actions,
  system,
  conversationsMoving,
  opportunities,
  studioOpportunity,
  targetProgress,
  adminSummary,
}: RelayTodayWorkspaceProps) {
  const dayKey = useMemo(() => `${DAILY_KEY_PREFIX}-${generatedAt.slice(0, 10)}`, [generatedAt])
  const [completedIds, setCompletedIds] = useState<string[]>([])
  const [snoozedIds, setSnoozedIds] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [resolvedNotice, setResolvedNotice] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(dayKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as { completed?: string[]; snoozed?: string[] }
      setCompletedIds(Array.isArray(parsed.completed) ? parsed.completed : [])
      setSnoozedIds(Array.isArray(parsed.snoozed) ? parsed.snoozed : [])
    } catch {
      // Ignore parse errors and start clean.
    }
  }, [dayKey])

  useEffect(() => {
    try {
      localStorage.setItem(dayKey, JSON.stringify({ completed: completedIds, snoozed: snoozedIds }))
    } catch {
      // Ignore local storage failures.
    }
  }, [completedIds, dayKey, snoozedIds])

  useEffect(() => {
    if (!resolvedNotice) return
    const timeout = setTimeout(() => setResolvedNotice(null), 2600)
    return () => clearTimeout(timeout)
  }, [resolvedNotice])

  const completedSet = useMemo(() => new Set(completedIds), [completedIds])
  const snoozedSet = useMemo(() => new Set(snoozedIds), [snoozedIds])

  const orderedActions = useMemo(() => {
    const active = actions.filter((action) => !completedSet.has(action.id))
    const immediate = active.filter((action) => !snoozedSet.has(action.id))
    const snoozed = active.filter((action) => snoozedSet.has(action.id))
    return [...immediate, ...snoozed]
  }, [actions, completedSet, snoozedSet])

  const topAction = orderedActions[0] ?? null
  const queue = orderedActions.slice(1)
  const selectedAction = selectedId
    ? orderedActions.find((action) => action.id === selectedId) ?? null
    : null

  const totalActions = actions.length
  const remaining = orderedActions.length
  const completedToday = totalActions - remaining
  const conversationsAdvanced = completedIds
    .map((id) => actions.find((action) => action.id === id))
    .filter((action) => action && (action.kind === 'reply_needed' || action.kind === 'followup_due' || action.kind === 'inbound_opportunity'))
    .length
  const opportunitiesWorked = completedIds
    .map((id) => actions.find((action) => action.id === id))
    .filter((action) => action && (action.kind === 'high_fit_lead' || action.kind === 'new_opportunity' || action.kind === 'job_worth_apply'))
    .length
  const inboundHandled = completedIds
    .map((id) => actions.find((action) => action.id === id))
    .filter((action) => action?.kind === 'inbound_opportunity').length

  const headline = dailyHeadline(remaining)
  const nowLabel = new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  function completeAction(action: RelayTodayAction, note?: string) {
    setCompletedIds((current) => (current.includes(action.id) ? current : [...current, action.id]))
    setSnoozedIds((current) => current.filter((id) => id !== action.id))
    setResolvedNotice(note ?? `${kindLabel(action.kind)} resolved`)
    setSelectedId(null)
  }

  function snoozeAction(action: RelayTodayAction) {
    setSnoozedIds((current) => (current.includes(action.id) ? current : [...current, action.id]))
    setSelectedId(null)
  }

  function markNotRelevant(action: RelayTodayAction) {
    completeAction(action, `${kindLabel(action.kind)} marked not relevant`)
  }

  const progressPct = totalActions > 0 ? Math.round((completedToday / totalActions) * 100) : 100

  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-2">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Your Relay / Today</p>
        <h1 className="text-[30px] font-medium tracking-[-0.03em] text-ink leading-[1.05]">{headline.title}</h1>
        <p className="text-[13px] text-graphite">
          {new Date(generatedAt).toLocaleDateString('en-US', { weekday: 'long' })} · {nowLabel} · {headline.sub}
        </p>
      </header>

      {resolvedNotice && (
        <div className="flex items-center gap-2 rounded border border-orange/30 bg-orange/[0.05] px-3 py-2 text-[12px] text-ink transition-all duration-200">
          <CheckCircle2 className="size-4 text-orange" />
          <span className="font-medium">{resolvedNotice}</span>
          {orderedActions[0] && (
            <span className="text-graphite">Next: {orderedActions[0].title}</span>
          )}
        </div>
      )}

      {topAction ? (
        <section className="srf-console srf-console-edge hero-console-pulse overflow-hidden p-5 sm:p-6">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">01 / Now</p>
          {topAction.inbound && (
            <div className="mt-2 inline-flex items-center gap-2 rounded border border-orange/30 bg-orange/15 px-2 py-1 text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">
              New inbound · moved to #1 because this conversation is active
            </div>
          )}
          <div className="mt-4 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <h2 className="text-[28px] leading-[1.08] tracking-[-0.03em] text-[color:var(--console-text)]">{topAction.title}</h2>
              <p className="text-[14px] text-[color:var(--console-mute)]">{topAction.subtitle}</p>

              <div className="srf-console-inset rounded-md px-3 py-3">
                <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-orange-light/80">Why this matters</p>
                <p className="mt-1 text-[13px] text-[color:var(--console-text)]">{topAction.whyItMatters}</p>
              </div>

              {topAction.identity && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--console-mute)]">
                  <span className="text-mono-medium uppercase tracking-[0.14em] text-stone-light">Working as</span>
                  <span className="rounded border border-orange/30 bg-orange/10 px-2 py-0.5 font-medium text-[color:var(--console-text)]">
                    {topAction.identity.name}
                  </span>
                  <span>{[topAction.identity.title, topAction.identity.channel?.toUpperCase()].filter(Boolean).join(' / ')}</span>
                </div>
              )}

              {topAction.proof && (
                <div className="srf-proof border-orange/20 bg-bone/95 px-3 py-2">
                  <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-orange-dark">Relevant proof</p>
                  <p className="mt-1 text-[12px] text-ink">{topAction.proof}</p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="srf-console-inset rounded-md border border-orange/25 px-3 py-3">
                <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-orange-light/90">Relay prepared</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--console-text)]">{topAction.prepared ?? topAction.humanAction}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(topAction.id)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-orange px-3 py-2.5 text-[13px] font-medium text-bone transition-colors hover:bg-orange-dark"
              >
                Review {kindActionLabel(topAction.kind)}
                <ArrowRight className="size-4" />
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => snoozeAction(topAction)}
                  className="rounded-md border border-line/30 px-2 py-2 text-[11px] text-[color:var(--console-mute)] hover:border-orange/40 hover:text-[color:var(--console-text)]"
                >
                  Snooze
                </button>
                <button
                  type="button"
                  onClick={() => markNotRelevant(topAction)}
                  className="rounded-md border border-line/30 px-2 py-2 text-[11px] text-[color:var(--console-mute)] hover:border-orange/40 hover:text-[color:var(--console-text)]"
                >
                  Not relevant
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded border border-line bg-bone-raised px-5 py-10 text-center">
          <p className="text-[28px] font-medium tracking-[-0.03em] text-ink">You&apos;re clear.</p>
          <p className="mt-2 text-[13px] text-graphite">Relay will keep watching for anything new.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link href="/prospect" className="inline-flex items-center gap-2 rounded-md bg-orange px-3 py-2 text-[12px] font-medium text-bone">
              Check a prospect
            </Link>
            <Link href="/content" className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[12px] font-medium text-ink hover:bg-bone">
              Create demand in Studio
            </Link>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Your Relay</p>
          <span className="text-[11px] text-graphite">{remaining} active</span>
        </div>
        {orderedActions.length > 0 ? (
          <div className="overflow-hidden rounded border border-line bg-bone-raised">
            {orderedActions.map((action, index) => {
              const stage = stageLabel(index, snoozedSet.has(action.id))
              const isPrimary = index === 0
              return (
                <button
                  type="button"
                  key={action.id}
                  onClick={() => setSelectedId(action.id)}
                  className={cn(
                    'group flex w-full items-center gap-3 border-b border-line/70 px-3 py-3 text-left transition-colors last:border-b-0',
                    isPrimary ? 'bg-orange/[0.05]' : 'hover:bg-bone',
                  )}
                >
                  <span className="w-7 text-mono-medium text-[11px] text-stone/75">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium text-ink">{kindActionLabel(action.kind)}</span>
                      <span className="truncate text-[12px] text-graphite">{action.title}</span>
                    </div>
                    <p className="truncate text-[12px] text-stone">{action.whyLines[0] ?? action.subtitle}</p>
                  </div>
                  <span className={cn(
                    'rounded px-2 py-0.5 text-mono-medium text-[10px] uppercase tracking-[0.12em]',
                    stage === 'NOW'
                      ? 'bg-orange text-bone'
                      : stage === 'NEXT'
                        ? 'bg-orange/15 text-orange'
                        : stage === 'TODAY'
                          ? 'bg-bone text-graphite'
                          : 'bg-bone text-stone',
                  )}>
                    {stage}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="rounded border border-dashed border-line px-4 py-7 text-center">
            <p className="text-[13px] font-medium text-ink">Nothing active right now.</p>
            <p className="mt-1 text-[12px] text-graphite">Relay has already sorted the rest.</p>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <div className="rounded border border-line bg-bone-raised px-4 py-4">
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Today&apos;s momentum</p>
            <div className="mt-2 grid gap-2 text-[13px] text-ink sm:grid-cols-2">
              <p>{completedToday} actions completed</p>
              <p>{conversationsAdvanced} conversations advanced</p>
              <p>{opportunitiesWorked} opportunities acted on</p>
              <p>{inboundHandled} inbound replies handled</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded bg-line/60">
              <div className="h-full rounded bg-orange transition-all duration-200" style={{ width: `${progressPct}%` }} />
            </div>
            {targetProgress && targetProgress.total > 0 && (
              <div className="mt-3 flex items-center justify-between text-[12px]">
                <span className="text-graphite">Today</span>
                <span className="font-medium text-ink">
                  {Math.min(targetProgress.completed + completedToday, targetProgress.total)} / {targetProgress.total}
                </span>
              </div>
            )}
          </div>

          <div className="rounded border border-line bg-bone-raised px-4 py-4">
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Conversations moving</p>
            {conversationsMoving.length > 0 ? (
              <div className="mt-3 space-y-3">
                {conversationsMoving.map((conversation) => (
                  <Link key={conversation.id} href={conversation.href} className="block border-b border-line/70 pb-3 last:border-b-0 last:pb-0">
                    <p className="text-[13px] font-medium text-ink">{conversation.name}</p>
                    <p className="text-[12px] text-graphite">{conversation.signal}</p>
                    <p className="mt-1 text-[11px] text-orange">Next: {conversation.next}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-3 space-y-1">
                <p className="text-[13px] font-medium text-ink">Nothing active yet.</p>
                <p className="text-[12px] text-graphite">When someone replies, Relay will bring it here and prepare the next move.</p>
              </div>
            )}
          </div>

          {studioOpportunity && (
            <div className="rounded border border-cobalt/25 bg-cobalt/[0.05] px-4 py-4">
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-cobalt">Studio / opportunity</p>
              <p className="mt-2 text-[16px] font-medium text-ink">{studioOpportunity.title}</p>
              <p className="mt-1 text-[12px] text-graphite">{studioOpportunity.whyYou}</p>
              <div className="mt-3 flex items-center gap-2">
                <Link href={studioOpportunity.href} className="inline-flex items-center gap-1 rounded-md bg-cobalt px-3 py-1.5 text-[12px] font-medium text-bone">
                  Write this
                  <ArrowRight className="size-3" />
                </Link>
                <button type="button" className="rounded-md border border-cobalt/30 px-3 py-1.5 text-[12px] text-cobalt">
                  Not today
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded border border-line bg-bone-raised px-4 py-4">
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Today / system</p>
            <div className="mt-2 space-y-2 text-[12px]">
              <SystemRow label="Conversations" value={`${system.conversationsActive} active`} sub={`${system.conversationsNeedReply} need reply`} href="/relay" />
              <SystemRow label="Opportunities" value={`${system.opportunitiesQualified} qualified`} sub={`${system.opportunitiesStrong} strong`} href="/leads" />
              <SystemRow label="Follow-ups" value={`${system.followupsDue} due`} sub="Actionable today" href="/leads" />
              <SystemRow label="Jobs" value={`${system.jobsWorthReview} worth reviewing`} sub="Apply queue" href="/upwork" />
              <SystemRow label="Studio" value={`${system.studioIdeasReady} ideas ready`} sub="Create demand" href="/content" />
            </div>
          </div>

          <div className="rounded border border-line bg-bone-raised px-4 py-4">
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Opportunities worth looking at</p>
            {opportunities.length > 0 ? (
              <div className="mt-3 space-y-3">
                {opportunities.map((opportunity) => (
                  <Link key={opportunity.id} href={opportunity.href} className="block rounded border border-line/70 bg-bone px-3 py-2 hover:border-orange/30">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] font-medium text-ink">{opportunity.name}</p>
                      {opportunity.fit !== null && (
                        <span className="text-mono-medium text-[11px] text-orange">{opportunity.fit} FIT</span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-graphite">{opportunity.why[0] ?? 'Strong profile match'}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-3 space-y-1">
                <p className="text-[13px] font-medium text-ink">No leads yet.</p>
                <p className="text-[12px] text-graphite">Start with a prospect you already have, or let Relay help you find one.</p>
                <div className="mt-2 flex items-center gap-2">
                  <Link href="/prospect" className="text-[11px] font-medium text-orange">Check a prospect</Link>
                  <span className="text-stone">·</span>
                  <Link href="/leads" className="text-[11px] font-medium text-orange">Find leads</Link>
                </div>
              </div>
            )}
          </div>

          {role === 'admin' && adminSummary && (
            <div className="rounded border border-line bg-bone-raised px-4 py-4">
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Founder command / today</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
                <MetricChip label="Attention" value={String(adminSummary.attentionItems.length).padStart(2, '0')} tone={adminSummary.attentionItems.length > 0 ? 'warn' : 'neutral'} />
                <MetricChip label="Team" value={`${adminSummary.onTrackCount} / ${adminSummary.totalReps}`} tone="good" />
                <MetricChip label="Conversations" value={String(adminSummary.activeConversations)} tone="neutral" />
                <MetricChip label="High-intent" value={String(adminSummary.highIntent)} tone="warn" />
              </div>

              {adminSummary.attentionItems.length > 0 && (
                <div className="mt-3 space-y-2">
                  {adminSummary.attentionItems.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        'rounded border px-2.5 py-2 text-[11px]',
                        item.severity === 'critical' ? 'border-status-danger/30 bg-status-danger/5 text-status-danger' : 'border-status-warning/30 bg-status-warning/5 text-status-warning',
                      )}
                    >
                      <p className="font-medium">{item.title}</p>
                      <p className="text-ink/70">{item.detail}</p>
                    </div>
                  ))}
                </div>
              )}

              <Link href="/admin/command-center" className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-ink">
                Open full command center
                <ExternalLink className="size-3" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {selectedAction && (
        <ActionDrawer
          action={selectedAction}
          onClose={() => setSelectedId(null)}
          onComplete={() => completeAction(selectedAction, `${kindLabel(selectedAction.kind)} sent`)}
          onSnooze={() => snoozeAction(selectedAction)}
          onNotRelevant={() => markNotRelevant(selectedAction)}
        />
      )}
    </div>
  )
}

function ActionDrawer({
  action,
  onClose,
  onComplete,
  onSnooze,
  onNotRelevant,
}: {
  action: RelayTodayAction
  onClose: () => void
  onComplete: () => void
  onSnooze: () => void
  onNotRelevant: () => void
}) {
  const [draft, setDraft] = useState(action.prepared ?? defaultDraft(action))
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setDraft(action.prepared ?? defaultDraft(action))
    setCopied(false)
  }, [action])

  function regenerate() {
    setDraft(defaultDraft(action, true))
  }

  function shorten() {
    if (draft.length < 200) return
    const shorter = `${draft.slice(0, 190).trimEnd()}...`
    setDraft(shorter)
  }

  function changeProof() {
    if (!action.proof) return
    setDraft((current) => `${current}\n\nProof to reference: ${action.proof}`)
  }

  async function copyAndResolve() {
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
    } catch {
      // Manual copy is still possible from visible text.
    }
    onComplete()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-ink/30" onClick={onClose} aria-label="Close action drawer" />
      <aside className="absolute inset-x-0 bottom-0 h-[88dvh] rounded-t-xl border-t border-line bg-bone-raised p-4 shadow-lg sm:right-0 sm:top-0 sm:h-full sm:w-[460px] sm:rounded-none sm:border-l sm:border-t-0 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">{kindLabel(action.kind)}</p>
            <h3 className="mt-1 text-[20px] font-medium tracking-[-0.02em] text-ink">{action.title}</h3>
            <p className="text-[12px] text-graphite">{action.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-stone hover:bg-bone">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3 overflow-y-auto pb-6">
          <DrawerFact label="Conversation context" value={action.whatHappened} icon={MessageSquare} />
          <DrawerFact label="Intent" value={action.whyItMatters} icon={Target} />
          <DrawerFact
            label="Identity"
            value={action.identity ? `${action.identity.name}${action.identity.title ? ` · ${action.identity.title}` : ''}` : 'Use your assigned identity'}
            icon={Sparkles}
          />
          <DrawerFact label="Proof" value={action.proof ?? 'No proof attached yet'} icon={Copy} />

          <div className="rounded border border-line bg-bone p-3">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Relay draft</p>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="mt-2 min-h-[170px] w-full resize-y rounded border border-line bg-bone-raised p-2.5 text-[13px] leading-relaxed text-ink outline-none focus:border-orange/50"
            />
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
              <button type="button" onClick={regenerate} className="rounded border border-line px-2 py-1.5 text-graphite hover:text-ink">
                Regenerate
              </button>
              <button type="button" onClick={shorten} className="rounded border border-line px-2 py-1.5 text-graphite hover:text-ink">
                Shorter
              </button>
              <button type="button" onClick={changeProof} className="rounded border border-line px-2 py-1.5 text-graphite hover:text-ink">
                Change proof
              </button>
              <Link href={action.href} className="rounded border border-line px-2 py-1.5 text-center text-graphite hover:text-ink">
                Open full page
              </Link>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void copyAndResolve()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-orange px-3 py-2.5 text-[13px] font-medium text-bone hover:bg-orange-dark"
          >
            {copied ? 'Copied and resolved' : 'Copy / Send'}
            <ArrowRight className="size-4" />
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onSnooze} className="rounded border border-line px-2 py-2 text-[11px] text-graphite hover:text-ink">
              Snooze
            </button>
            <button type="button" onClick={onNotRelevant} className="rounded border border-line px-2 py-2 text-[11px] text-graphite hover:text-ink">
              Not relevant
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

function DrawerFact({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded border border-line bg-bone p-3">
      <p className="flex items-center gap-1.5 text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-1 text-[12px] text-ink">{value}</p>
    </div>
  )
}

function SystemRow({
  label,
  value,
  sub,
  href,
}: {
  label: string
  value: string
  sub: string
  href: string
}) {
  return (
    <Link href={href} className="flex items-center justify-between gap-2 rounded border border-line/50 bg-bone px-2.5 py-2 hover:border-orange/30">
      <span className="text-stone">{label}</span>
      <span className="text-right">
        <span className="block text-ink">{value}</span>
        <span className="block text-[10px] text-graphite">{sub}</span>
      </span>
    </Link>
  )
}

function MetricChip({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'good' | 'warn' | 'neutral'
}) {
  return (
    <div className={cn(
      'rounded border px-2.5 py-2',
      tone === 'good'
        ? 'border-status-success/30 bg-status-success/5'
        : tone === 'warn'
          ? 'border-status-warning/30 bg-status-warning/5'
          : 'border-line bg-bone',
    )}>
      <p className="text-mono-medium text-[9px] uppercase tracking-[0.12em] text-stone">{label}</p>
      <p className="mt-1 text-[14px] font-medium text-ink">{value}</p>
    </div>
  )
}

function kindLabel(kind: ActionKind): string {
  switch (kind) {
    case 'reply_needed':
      return 'Reply sent'
    case 'followup_due':
      return 'Follow-up sent'
    case 'high_fit_lead':
      return 'Prospect checked'
    case 'new_opportunity':
      return 'Opportunity reviewed'
    case 'job_worth_apply':
      return 'Application prepared'
    case 'proposal_ready':
      return 'Proposal reviewed'
    case 'lead_going_cold':
      return 'Cold lead decided'
    case 'content_opportunity':
      return 'Studio idea reviewed'
    case 'admin_review':
      return 'Management review done'
    case 'inbound_opportunity':
      return 'Inbound handled'
  }
}

function kindActionLabel(kind: ActionKind): string {
  switch (kind) {
    case 'reply_needed':
      return 'Reply'
    case 'followup_due':
      return 'Follow-up'
    case 'high_fit_lead':
      return 'Prospect'
    case 'new_opportunity':
      return 'Opportunity'
    case 'job_worth_apply':
      return 'Upwork'
    case 'proposal_ready':
      return 'Proposal'
    case 'lead_going_cold':
      return 'Decide'
    case 'content_opportunity':
      return 'Studio'
    case 'admin_review':
      return 'Review'
    case 'inbound_opportunity':
      return 'Inbound'
  }
}

function stageLabel(index: number, snoozed: boolean): 'NOW' | 'NEXT' | 'TODAY' | 'WHEN READY' {
  if (snoozed) return 'WHEN READY'
  if (index === 0) return 'NOW'
  if (index === 1) return 'NEXT'
  if (index <= 4) return 'TODAY'
  return 'WHEN READY'
}

function dailyHeadline(remaining: number): { title: string; sub: string } {
  if (remaining === 0) {
    return {
      title: 'You\'re clear.',
      sub: 'Relay will keep watching for anything new.',
    }
  }
  if (remaining === 1) {
    return {
      title: 'One thing deserves your attention.',
      sub: 'Relay has already sorted the rest.',
    }
  }
  if (remaining === 2) {
    return {
      title: 'Two important things remain.',
      sub: 'Relay has already sorted the rest.',
    }
  }
  return {
    title: `${toWord(remaining)} things deserve your attention.`,
    sub: 'Relay has already sorted the rest.',
  }
}

function toWord(value: number): string {
  const map: Record<number, string> = {
    3: 'Three',
    4: 'Four',
    5: 'Five',
    6: 'Six',
    7: 'Seven',
    8: 'Eight',
    9: 'Nine',
    10: 'Ten',
  }
  return map[value] ?? String(value)
}

function defaultDraft(action: RelayTodayAction, alt = false): string {
  if (action.kind === 'reply_needed' || action.kind === 'inbound_opportunity') {
    return alt
      ? `Thanks for the reply, ${action.subtitle}. Happy to share a relevant example.\n\n${action.proof ? `A close match: ${action.proof}.` : 'I can share a relevant case study.'}\n\nWould tomorrow afternoon work for a quick call?`
      : `Great to hear from you, ${action.subtitle}.\n\n${action.proof ? `A similar example is ${action.proof}.` : 'I can send a relevant proof example.'}\n\nIf useful, I can send a quick outline of how we would approach this.`
  }

  if (action.kind === 'followup_due') {
    return `Quick follow-up in case this is still useful for ${action.title}.\n\nNo pressure if priorities shifted. If it helps, I can send a concise plan specific to your situation.`
  }

  return `Relay prepared context for ${action.title}.\n\nNext move: ${action.humanAction}.`
}
