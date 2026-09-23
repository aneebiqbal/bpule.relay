'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Target,
  X,
  Clock,
  AlertTriangle,
  Zap,
} from 'lucide-react'
import { cn } from 'cn'
import { Progress } from '@/components/ui/progress'
import { StatusBadge } from '@/components/ui/status-badge'

type ActionKind =
  | 'reply_needed'
  | 'connection_dm_due'
  | 'followup_due'
  | 'high_fit_lead'
  | 'new_opportunity'
  | 'job_worth_apply'
  | 'proposal_ready'
  | 'lead_going_cold'
  | 'content_opportunity'
  | 'admin_review'
  | 'inbound_opportunity'

type StudioIdeaSeed = {
  title: string
  angle: string
  territory: string
  sourceKind: 'expertise' | 'journey' | 'opinion' | 'trend' | 'project' | 'audience_gap' | 'evergreen'
  whyYou: string
  whyAudience: string
}

export interface StudioOpportunityCard {
  title: string
  whyYou: string
  href: string
  personaId: string
  draftId: string | null
  platform: 'linkedin' | 'x'
  idea: StudioIdeaSeed | null
}

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
  studioOpportunity: StudioOpportunityCard | null
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
      <header className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Your Relay</p>
          <span className="size-1 rounded-full bg-line" />
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Today</p>
        </div>
        <h1 className="text-display text-[28px] font-light tracking-[-0.02em] text-ink sm:text-[32px]">
          {headline.title}
        </h1>
        <p className="text-[13px] text-graphite">
          {new Date(generatedAt).toLocaleDateString('en-US', { weekday: 'long' })} · {nowLabel} · {headline.sub}
        </p>
        {totalActions > 0 && (
          <div className="flex items-center gap-3 pt-1">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-line/60">
              <div
                className="h-full rounded-full bg-orange transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="shrink-0 text-mono-medium text-[10px] text-stone">{completedToday}/{totalActions}</span>
          </div>
        )}
      </header>

      {resolvedNotice && (
        <div className="flex items-center gap-2 rounded-lg border border-status-success/20 bg-status-success/5 px-3 py-2 text-[12px] text-ink fade-in">
          <CheckCircle2 className="size-4 text-status-success" />
          <span className="font-medium">{resolvedNotice}</span>
          {orderedActions[0] && (
            <span className="text-graphite">Next: {orderedActions[0].title}</span>
          )}
        </div>
      )}

      {topAction ? (
        <section className="overflow-hidden rounded-lg border border-line bg-bone-raised shadow-sm">
          <div className="border-b border-line bg-bone-raised px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-orange text-[10px] font-bold text-on-accent">1</span>
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange">Now</p>
              {topAction.inbound && (
                <StatusBadge status="Inbound" variant="orange" />
              )}
            </div>
          </div>
          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <h2 className="text-heading text-xl font-medium tracking-[-0.01em] text-ink sm:text-2xl">
                {topAction.title}
              </h2>
              <p className="text-[14px] text-graphite">{topAction.subtitle}</p>

              <div className="rounded-md border border-line bg-bone px-3 py-3">
                <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Why this matters</p>
                <p className="mt-1 text-[13px] text-ink">{topAction.whyItMatters}</p>
              </div>

              {topAction.identity && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-graphite">
                  <span className="text-mono-medium uppercase tracking-[0.14em] text-stone">Working as</span>
                  <span className="rounded-full border border-line bg-bone-raised px-2 py-0.5 font-medium text-ink">
                    {topAction.identity.name}
                  </span>
                  <span>{[topAction.identity.title, topAction.identity.channel?.toUpperCase()].filter(Boolean).join(' / ')}</span>
                </div>
              )}

              {topAction.proof && (
                <div className="rounded-md border border-orange/20 bg-orange/5 px-3 py-2">
                  <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-orange">Relevant proof</p>
                  <p className="mt-1 text-[12px] text-ink">{topAction.proof}</p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="rounded-md border border-line bg-bone px-3 py-3">
                <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Relay prepared</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink">{topAction.prepared ?? topAction.humanAction}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(topAction.id)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-orange px-3 py-2.5 text-[13px] font-medium text-on-accent transition-colors hover:bg-orange-dark"
              >
                Review {kindActionLabel(topAction.kind)}
                <ArrowRight className="size-4" />
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => snoozeAction(topAction)}
                  className="rounded-md border border-line px-2 py-2 text-[11px] text-graphite transition-colors hover:bg-bone hover:text-ink"
                >
                  Snooze
                </button>
                <button
                  type="button"
                  onClick={() => markNotRelevant(topAction)}
                  className="rounded-md border border-line px-2 py-2 text-[11px] text-graphite transition-colors hover:bg-bone hover:text-ink"
                >
                  Not relevant
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-line bg-bone-raised/40 px-5 py-10 text-center">
          <p className="text-heading text-xl font-light text-ink">You&apos;re clear.</p>
          <p className="mt-1 text-[13px] text-graphite">Relay will keep watching for anything new.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link href="/prospect" className="inline-flex items-center gap-2 rounded-md bg-orange px-3 py-2 text-[12px] font-medium text-on-accent">
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
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Action queue</p>
          <span className="text-[11px] text-graphite">{remaining} active</span>
        </div>
        {orderedActions.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-line bg-bone-raised">
            {orderedActions.map((action, index) => {
              const stage = stageLabel(index, snoozedSet.has(action.id))
              const isPrimary = index === 0
              return (
                <button
                  type="button"
                  key={action.id}
                  onClick={() => setSelectedId(action.id)}
                  className={cn(
                    'group flex w-full items-center gap-3 border-b border-line/60 px-3 py-3 text-left transition-colors last:border-b-0',
                    isPrimary ? 'bg-orange/[0.03]' : 'hover:bg-bone',
                  )}
                >
                  <span className="w-6 text-mono-medium text-[11px] text-stone/75">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-ink">{kindActionLabel(action.kind)}</span>
                      <span className="truncate text-[12px] text-graphite">{action.title}</span>
                    </div>
                    <p className="truncate text-[11px] text-stone">{action.whyLines[0] ?? action.subtitle}</p>
                  </div>
                  <span className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-mono-medium text-[9px] uppercase tracking-[0.12em]',
                    stage === 'NOW'
                      ? 'bg-orange text-on-accent'
                      : stage === 'NEXT'
                        ? 'bg-orange/10 text-orange'
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
          <div className="rounded-lg border border-dashed border-line bg-bone-raised/40 px-4 py-7 text-center">
            <p className="text-[13px] font-medium text-ink">Nothing active right now.</p>
            <p className="mt-1 text-[12px] text-graphite">Relay has already sorted the rest.</p>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          {conversationsMoving.length > 0 && (
            <div>
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Conversations moving</p>
              <div className="mt-2 space-y-0">
                {conversationsMoving.map((conversation) => (
                  <Link key={conversation.id} href={conversation.href} className="flex items-baseline justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">{conversation.name}</p>
                      <p className="truncate text-[11px] text-graphite">{conversation.signal}</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-orange">Next: {conversation.next}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {opportunities.length > 0 && (
            <div>
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Opportunities</p>
              <div className="mt-2 space-y-0">
                {opportunities.map((opportunity) => (
                  <Link key={opportunity.id} href={opportunity.href} className="flex items-baseline justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">{opportunity.name}</p>
                      <p className="truncate text-[11px] text-graphite">{opportunity.why[0] ?? 'Strong profile match'}</p>
                    </div>
                    {opportunity.fit !== null && (
                      <span className="shrink-0 text-mono-medium text-[11px] text-orange">{opportunity.fit} FIT</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {opportunities.length === 0 && (
            <p className="text-[12px] text-graphite">No leads yet. Start with a prospect you already have.</p>
          )}

          {studioOpportunity && (
            <div className="border-l-2 border-cobalt/30 pl-4">
              <div className="flex items-center gap-2">
                <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-cobalt">Studio opportunity</p>
                <StatusBadge status="Ready" variant="cobalt" />
              </div>
              <p className="mt-1 text-[14px] font-medium text-ink">{studioOpportunity.title}</p>
              <p className="mt-0.5 text-[12px] text-graphite">{studioOpportunity.whyYou}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StudioWriteThisButton opportunity={studioOpportunity} />
                <Link href={studioOpportunity.href} className="text-[12px] font-medium text-cobalt">
                  Open in Studio →
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">System</p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
              <SystemStat label="Conversations" value={system.conversationsActive} sub={`${system.conversationsNeedReply} need reply`} href="/relay" />
              <SystemStat label="Opportunities" value={system.opportunitiesQualified} sub={`${system.opportunitiesStrong} strong`} href="/leads" />
              <SystemStat label="Follow-ups" value={system.followupsDue} sub="due today" href="/leads" />
              <SystemStat label="Studio" value={system.studioIdeasReady} sub="ideas ready" href="/content" />
            </div>
          </div>

          {targetProgress && targetProgress.total > 0 && (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Daily target</p>
                <span className="text-mono-medium text-[11px] text-ink">
                  {Math.min(targetProgress.completed + completedToday, targetProgress.total)} / {targetProgress.total}
                </span>
              </div>
            </div>
          )}

          {role === 'admin' && adminSummary && (
            <div>
              <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Team</p>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                <SystemStat label="On track" value={`${adminSummary.onTrackCount}/${adminSummary.totalReps}`} tone="good" />
                <SystemStat label="Active convos" value={adminSummary.activeConversations} />
                <SystemStat label="High-intent" value={adminSummary.highIntent} tone={adminSummary.highIntent > 0 ? 'warn' : 'neutral'} />
                <SystemStat label="Attention" value={adminSummary.attentionItems.length} tone={adminSummary.attentionItems.length > 0 ? 'warn' : 'neutral'} />
              </div>

              {adminSummary.attentionItems.length > 0 && (
                <div className="mt-2 space-y-1">
                  {adminSummary.attentionItems.slice(0, 3).map((item) => (
                    <p key={item.id} className={cn(
                      'text-[11px]',
                      item.severity === 'critical' ? 'text-status-danger' : 'text-status-warning',
                    )}>
                      {item.title}
                    </p>
                  ))}
                </div>
              )}

              <Link href="/admin/command-center" className="mt-2 inline-block text-[11px] font-medium text-ink">
                Open command center →
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
      <aside className="absolute inset-x-0 bottom-0 h-[88dvh] overflow-y-auto rounded-t-xl border-t border-line bg-bone-raised p-4 shadow-lg sm:right-0 sm:top-0 sm:h-full sm:w-[460px] sm:rounded-none sm:border-l sm:border-t-0 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">{kindLabel(action.kind)}</p>
            <h3 className="mt-1 text-lg font-medium tracking-[-0.01em] text-ink">{action.title}</h3>
            <p className="text-[12px] text-graphite">{action.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-stone transition-colors hover:bg-bone">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3 pb-6">
          <DrawerFact label="Conversation context" value={action.whatHappened} icon={MessageSquare} />
          <DrawerFact label="Intent" value={action.whyItMatters} icon={Target} />
          <DrawerFact
            label="Identity"
            value={action.identity ? `${action.identity.name}${action.identity.title ? ` · ${action.identity.title}` : ''}` : 'Use your assigned identity'}
            icon={Sparkles}
          />
          <DrawerFact label="Proof" value={action.proof ?? 'No proof attached yet'} icon={Copy} />

          <div className="rounded-md border border-line bg-bone p-3">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Relay draft</p>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="mt-2 min-h-[170px] w-full resize-y rounded-md border border-line bg-bone-raised p-2.5 text-[13px] leading-relaxed text-ink outline-none focus:border-orange/50"
            />
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
              <button type="button" onClick={regenerate} className="rounded-md border border-line px-2 py-1.5 text-graphite transition-colors hover:text-ink">
                Regenerate
              </button>
              <button type="button" onClick={shorten} className="rounded-md border border-line px-2 py-1.5 text-graphite transition-colors hover:text-ink">
                Shorter
              </button>
              <button type="button" onClick={changeProof} className="rounded-md border border-line px-2 py-1.5 text-graphite transition-colors hover:text-ink">
                Change proof
              </button>
              <Link href={action.href} className="rounded-md border border-line px-2 py-1.5 text-center text-graphite transition-colors hover:text-ink">
                Open full page
              </Link>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void copyAndResolve()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-orange px-3 py-2.5 text-[13px] font-medium text-on-accent transition-colors hover:bg-orange-dark"
          >
            {copied ? 'Copied and resolved' : 'Copy / Send'}
            <ArrowRight className="size-4" />
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onSnooze} className="rounded-md border border-line px-2 py-2 text-[11px] text-graphite transition-colors hover:text-ink">
              Snooze
            </button>
            <button type="button" onClick={onNotRelevant} className="rounded-md border border-line px-2 py-2 text-[11px] text-graphite transition-colors hover:text-ink">
              Not relevant
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

function StudioWriteThisButton({ opportunity }: { opportunity: StudioOpportunityCard }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'writing' | 'opening' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [manualHref, setManualHref] = useState<string | null>(null)
  const [visualWarning, setVisualWarning] = useState<string | null>(null)

  async function openWorkspace(draftId: string) {
    const href = `/studio/drafts/${draftId}`
    const check = await fetch(`/api/content/drafts/${draftId}`, { method: 'GET' })
    if (!check.ok) {
      throw new Error('Draft was created, but workspace did not load. Open Studio manually.')
    }
    router.push(href)
  }

  async function handleWriteThis() {
    setError(null)
    setVisualWarning(null)

    if (opportunity.draftId) {
      setState('opening')
      try {
        await openWorkspace(opportunity.draftId)
      } catch (err) {
        setState('error')
        setManualHref(`/studio/drafts/${opportunity.draftId}`)
        setError(err instanceof Error ? err.message : 'Could not open Studio draft.')
      }
      return
    }

    if (!opportunity.idea) {
      router.push(opportunity.href)
      return
    }

    setState('writing')
    let createdDraftId: string | null = null
    try {
      const res = await fetch('/api/content/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: opportunity.personaId,
          idea: {
            title: opportunity.idea.title,
            angle: opportunity.idea.angle,
            territory: opportunity.idea.territory,
            sourceKind: opportunity.idea.sourceKind,
            whyYou: opportunity.idea.whyYou,
            whyAudience: opportunity.idea.whyAudience,
          },
          platform: opportunity.platform,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || `Draft generation failed (${res.status})`)
      }
      if (!data?.draftId || typeof data.draftId !== 'string') {
        throw new Error('Draft generation succeeded but returned no draft ID.')
      }

      createdDraftId = data.draftId
      const hasVisualIdea = typeof data.visualIdea === 'string' && data.visualIdea.trim().length > 0
      const hasImagePrompt = typeof data.imagePrompt === 'string' && data.imagePrompt.trim().length > 0
      if (!hasVisualIdea || !hasImagePrompt) {
        setVisualWarning('Visual package was not returned immediately. Refresh visual inside workspace.')
      }

      setState('opening')
      await openWorkspace(data.draftId)
    } catch (err) {
      setState('error')
      if (createdDraftId) {
        setManualHref(`/studio/drafts/${createdDraftId}`)
      }
      setError(err instanceof Error ? err.message : 'Could not create your draft right now.')
    }
  }

  const label = state === 'writing'
    ? 'Writing...'
    : state === 'opening'
      ? 'Opening workspace...'
      : 'Write this'

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => void handleWriteThis()}
        disabled={state === 'writing' || state === 'opening'}
        className="inline-flex items-center gap-1 rounded-md bg-cobalt px-3 py-1.5 text-[12px] font-medium text-on-accent transition-colors hover:bg-cobalt-dark disabled:opacity-60"
      >
        {label}
        <ArrowRight className="size-3" />
      </button>
      {visualWarning ? <p className="text-[11px] text-status-warning">{visualWarning}</p> : null}
      {error ? <p className="text-[11px] text-status-danger">{error}</p> : null}
      {manualHref ? (
        <Link href={manualHref} className="inline-flex items-center gap-1 text-[11px] font-medium text-cobalt underline underline-offset-2">
          Open draft manually
        </Link>
      ) : null}
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
    <div className="rounded-md border border-line bg-bone p-3">
      <p className="flex items-center gap-1.5 text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-1 text-[12px] text-ink">{value}</p>
    </div>
  )
}

function SystemStat({
  label,
  value,
  sub,
  href,
  tone,
}: {
  label: string
  value: string | number
  sub?: string
  href?: string
  tone?: 'good' | 'warn' | 'neutral'
}) {
  const valueClass = tone === 'good'
    ? 'text-status-success'
    : tone === 'warn'
      ? 'text-orange'
      : 'text-ink'

  const inner = (
    <>
      <span className="text-[11px] text-graphite">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className={cn('text-[14px] font-medium', valueClass)}>{value}</span>
        {sub && <span className="text-[10px] text-stone">{sub}</span>}
      </span>
    </>
  )

  if (href) {
    return (
      <Link href={href} className="group flex items-baseline justify-between gap-2">
        {inner}
      </Link>
    )
  }

  return (
    <div className="flex items-baseline justify-between gap-2">
      {inner}
    </div>
  )
}

function kindLabel(kind: ActionKind): string {
  switch (kind) {
    case 'reply_needed':
      return 'Reply sent'
    case 'connection_dm_due':
      return 'Connection message sent'
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
    case 'connection_dm_due':
      return 'Message'
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
