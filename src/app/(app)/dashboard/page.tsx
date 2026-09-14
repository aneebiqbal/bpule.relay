import Link from 'next/link'
import {
  ArrowRight,
  MessageCircle,
  Plus,
  Clock,
  Search,
  Target,
  Sun,
  Sunset,
  Moon,
  type LucideIcon,
} from 'lucide-react'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { signalById } from '@/lib/score/signals'
import { NotificationFeed, type NotificationItem } from '@/components/notification-feed'
import { ScoreRing } from '@/components/score-ring'
import { cn } from 'cn'
import type { Lead } from '@/lib/domain/types'
import { generateDailyIdeas } from '@/lib/content/daily-ideas'

export const dynamic = 'force-dynamic'

function timeGreeting(icon: LucideIcon, sub: string) {
  return { icon, sub }
}

function getTimeContext(): { icon: LucideIcon; greeting: string; sub: string } {
  const h = new Date().getHours()
  if (h < 5) return { ...timeGreeting(Moon, 'The queue will be fresh in the morning.'), greeting: 'Good evening' }
  if (h < 12) return { ...timeGreeting(Sun, 'A fresh queue. Start at the top.'), greeting: 'Good morning' }
  if (h < 17) return { ...timeGreeting(Sun, 'Keep the momentum going.'), greeting: 'Good afternoon' }
  if (h < 21) return { ...timeGreeting(Sunset, 'Wrap up strong.'), greeting: 'Good evening' }
  return { ...timeGreeting(Moon, 'The queue will be fresh in the morning.'), greeting: 'Good evening' }
}

type ActionItem = {
  id: string
  lead: Lead
  action: string
  reason: string
  priority: number
  kind: 'reply' | 'followup' | 'new' | 'apply'
}

export default async function TodayPage() {
  const user = await getCurrentUser()
  const store = await createScoutStore()
  const dash = await store.getTodayDashboard()
  const { mine, sendBudgets, notifications, followupsDue, team } = dash

  const firstName = user?.rep.name.split(' ')[0] ?? 'there'
  const time = getTimeContext()

  const coldQueue = [...mine.queue].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0) || b.createdAt.localeCompare(a.createdAt),
  )
  const followupIds = new Set(followupsDue.map((f) => f.lead.id))

  // Build prioritized action queue
  const actions: ActionItem[] = [
    ...mine.replies.map((lead, i) => ({
      id: lead.id,
      lead,
      action: 'Reply',
      reason: 'They wrote back',
      priority: 100 - i,
      kind: 'reply' as const,
    })),
    ...followupsDue.map((f, i) => ({
      id: f.lead.id,
      lead: f.lead,
      action: 'Follow up',
      reason: `${f.daysSinceContact} days, no reply`,
      priority: 80 - i,
      kind: 'followup' as const,
    })),
    ...coldQueue
      .filter((lead) => !followupIds.has(lead.id))
      .slice(0, 6)
      .map((lead, i) => ({
        id: lead.id,
        lead,
        action: 'Contact',
        reason: signalById(lead.signalType)?.description ?? 'Scored and ready',
        priority: 50 - i,
        kind: 'new' as const,
      })),
  ]

  const [topAction, ...queueRest] = actions
  const replyCount = mine.replies.length
  const followupCount = followupsDue.length
  const totalActions = actions.length

  const knownLeads = new Map(actions.map((a) => [a.lead.id, a.lead.company]))
  const notificationItems: NotificationItem[] = notifications.map((n) => {
    const leadId = typeof n.payload.lead_id === 'string' ? n.payload.lead_id : null
    return {
      id: n.id,
      type: n.type,
      leadId,
      company: leadId ? (knownLeads.get(leadId) ?? null) : null,
      createdAt: n.createdAt,
    }
  })

  const totalLimit = sendBudgets.reduce((sum, b) => sum + b.limit, 0)
  const totalUsed = sendBudgets.reduce((sum, b) => sum + b.used, 0)
  const sendsLeftToday = totalLimit - totalUsed
  const atAnyCeiling = totalUsed >= totalLimit
  const replyRatePct = team.replyRate !== null ? Math.round(team.replyRate * 100) : null

  // Load content idea for header
  let contentForToday = dash.contentForToday
  if (!contentForToday && user) {
    try {
      const personas = await store.listContentPersonas(user.rep.id)
      if (personas.length > 0) {
        const persona = personas[0]
        const profile = persona.contentProfileId ? await store.getContentProfile(persona.contentProfileId) : null
        const clusters = await store.listTopicClusters(persona.id)
        const memories = await store.listContentMemories(persona.id, { limit: 30 })
        const journey = await store.listContentJourney?.(persona.id, 20) ?? []
        const ideas = generateDailyIdeas({
          profile, clusters, history: [], memories, journey,
          contentGoals: profile?.contentGoals ?? [],
          audiences: profile?.audiences ?? [],
          territories: profile?.territories ?? [],
        })
        if (ideas[0]) {
          contentForToday = {
            personaId: persona.id,
            personaName: persona.displayName,
            ideaTitle: ideas[0].title,
            ideaAngle: ideas[0].angle,
            ideaReason: ideas[0].whyYou || 'Based on your Content Identity',
          }
        }
      }
    } catch {
      // Silent
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <header className="reveal-up flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-label text-stone">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
          <h1 className="text-display text-[28px] text-ink mt-1">
            {time.greeting}, {firstName}.
          </h1>
          <p className="text-[14px] text-graphite mt-1">
            {totalActions > 0
              ? `You have ${totalActions} ${totalActions === 1 ? 'opportunity' : 'opportunities'} worth acting on today.`
              : time.sub}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/prospect"
            className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-bone transition-all hover:bg-orange-dark active:scale-[0.97]"
          >
            <Search className="size-4" aria-hidden="true" />
            Check a prospect
          </Link>
          <Link
            href="/leads/new"
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-bone transition-all hover:bg-ink/90 active:scale-[0.97]"
          >
            <Plus className="size-4" aria-hidden="true" />
            New lead
          </Link>
        </div>
      </header>

      {/* ── Signals — what needs attention ── */}
      {(replyCount > 0 || followupCount > 0) && (
        <section className="reveal-up stagger-1 grid gap-2 sm:grid-cols-2">
          {replyCount > 0 && (
            <Link
              href={mine.replies[0] ? `/leads/${mine.replies[0].id}` : '/leads/new'}
              className="group flex items-center gap-3 rounded-lg border border-status-success/15 bg-status-success/[0.04] px-4 py-3 transition-all hover:border-status-success/30"
            >
              <MessageCircle className="size-4 text-status-success" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink">{replyCount} {replyCount === 1 ? 'reply' : 'replies'} waiting</p>
                <p className="text-[12px] text-graphite truncate">{mine.replies[0]?.company}</p>
              </div>
              <ArrowRight className="size-3.5 text-stone transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
          {followupCount > 0 && (
            <Link
              href={followupsDue[0] ? `/leads/${followupsDue[0].lead.id}` : '/leads/new'}
              className="group flex items-center gap-3 rounded-lg border border-status-warning/15 bg-status-warning/[0.04] px-4 py-3 transition-all hover:border-status-warning/30"
            >
              <Clock className="size-4 text-status-warning" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink">{followupCount} follow-up{followupCount === 1 ? '' : 's'} due</p>
                <p className="text-[12px] text-graphite truncate">{followupsDue[0]?.lead.company}</p>
              </div>
              <ArrowRight className="size-3.5 text-stone transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </section>
      )}

      {/* ── Today's Pick / Studio ── */}
      {contentForToday && (
        <section className="reveal-up stagger-2 rounded-xl border border-cobalt/15 bg-cobalt/[0.03] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-label text-cobalt/70">Studio · Worth saying today</p>
              <h3 className="mt-1 text-[15px] font-medium text-ink leading-snug">{contentForToday.ideaTitle}</h3>
              <p className="mt-1 text-[12px] text-graphite line-clamp-2">{contentForToday.ideaReason}</p>
              <p className="mt-2 text-[11px] text-stone">
                Persona: {contentForToday.personaName}
                {contentForToday.draftId ? ' · Draft saved' : ''}
              </p>
            </div>
            <div className="shrink-0">
              {contentForToday.draftId ? (
                <a
                  href={`/studio/drafts/${contentForToday.draftId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone"
                >
                  Continue
                </a>
              ) : (
                <a
                  href={`/content/${contentForToday.personaId}/today`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cobalt px-3 py-1.5 text-[12px] font-medium text-bone hover:bg-cobalt-dark"
                >
                  Write this
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Action Queue ── */}
      {topAction && (
        <section className="reveal-up stagger-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-label text-stone">Your Relay</h2>
            {queueRest.length > 0 && (
              <span className="text-mono-medium text-[11px] text-stone">{queueRest.length} more</span>
            )}
          </div>

          {/* Top priority — hero card */}
          <Link
            href={`/leads/${topAction.lead.id}`}
            className="group block rounded-xl border border-orange/15 bg-orange/[0.03] p-5 transition-all hover:border-orange/30 hover:shadow-sm"
          >
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                {topAction.lead.score !== null ? (
                  <ScoreRing score={topAction.lead.score} size={48} />
                ) : (
                  <div className="flex size-[48px] items-center justify-center rounded-full border border-dashed border-line">
                    <Target className="size-4 text-stone" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-orange/10 px-1.5 py-0.5 text-[10px] font-medium text-orange">
                    {topAction.action}
                  </span>
                  {topAction.kind === 'reply' && (
                    <span className="rounded bg-status-success/10 px-1.5 py-0.5 text-[10px] font-medium text-status-success">high intent</span>
                  )}
                  {topAction.kind === 'followup' && (
                    <span className="rounded bg-status-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warning">due</span>
                  )}
                </div>
                <h3 className="mt-1.5 text-[16px] font-medium text-ink">{topAction.lead.company}</h3>
                {topAction.lead.contactName && (
                  <p className="text-[13px] text-graphite">{topAction.lead.contactName}</p>
                )}
                <p className="mt-1 text-[13px] text-graphite">{topAction.reason}</p>
              </div>
              <div className="shrink-0 self-center">
                <span className="inline-flex items-center gap-1 text-[13px] font-medium text-orange opacity-0 transition-opacity group-hover:opacity-100">
                  Open lead <ArrowRight className="size-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Rest of queue */}
          {queueRest.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-line bg-bone-raised">
              <ul className="divide-y divide-line">
                {queueRest.map((item, i) => (
                  <li key={item.id}>
                    <Link
                      href={`/leads/${item.lead.id}`}
                      className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bone"
                    >
                      <span className="w-5 text-mono-medium text-[11px] text-stone/50 tabular-nums">
                        {String(i + 2).padStart(2, '0')}
                      </span>
                      {item.lead.score !== null ? (
                        <ScoreRing score={item.lead.score} size={28} />
                      ) : (
                        <div className="flex size-[28px] items-center justify-center">
                          <Target className="size-3 text-stone" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-ink">{item.lead.company}</span>
                        </div>
                        <p className="truncate text-[11px] text-stone">{item.reason}</p>
                      </div>
                      <span className="shrink-0 rounded bg-bone px-2 py-0.5 text-[10px] font-medium text-graphite">
                        {item.action}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Notifications ── */}
      {notificationItems.length > 0 && (
        <section className="reveal-up stagger-3">
          <NotificationFeed initial={notificationItems} />
        </section>
      )}

      {/* ── Operating metrics ── */}
      <section className="reveal-up stagger-3 rounded-lg border border-line bg-bone-raised">
        <div className="grid divide-line sm:grid-cols-3 sm:divide-x">
          <div className="flex flex-col gap-0.5 px-4 py-3">
            <span className="text-label text-stone">Sends left</span>
            <span className="text-mono-medium text-lg font-medium text-ink">
              {atAnyCeiling ? 'At limit' : sendsLeftToday}
            </span>
            <span className="text-[11px] text-stone">{atAnyCeiling ? 'Resumes tomorrow' : `of ${totalLimit} today`}</span>
          </div>
          <div className="flex flex-col gap-0.5 px-4 py-3">
            <span className="text-label text-stone">Queue</span>
            <span className="text-mono-medium text-lg font-medium text-ink">{totalActions}</span>
            <span className="text-[11px] text-stone">{replyCount} hot · {followupCount} due</span>
          </div>
          <div className="flex flex-col gap-0.5 px-4 py-3">
            <span className="text-label text-stone">Reply rate</span>
            <span className={cn('text-mono-medium text-lg font-medium', replyRatePct !== null && replyRatePct >= 20 ? 'text-status-success' : 'text-ink')}>
              {replyRatePct !== null ? `${replyRatePct}%` : '—'}
            </span>
            <span className="text-[11px] text-stone">{replyRatePct !== null && replyRatePct >= 20 ? 'On target' : 'Building data'}</span>
          </div>
        </div>
      </section>

      {/* ── Empty state ── */}
      {!topAction && queueRest.length === 0 && (
        <section className="reveal-up stagger-2 rounded-lg border border-dashed border-line py-12 text-center">
          <div className="mx-auto max-w-xs space-y-3">
            <p className="text-[15px] font-medium text-ink">Nothing needs your attention right now.</p>
            <p className="text-[13px] leading-relaxed text-graphite">
              Paste a LinkedIn profile to check if they are worth pursuing.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Link
                href="/prospect"
                className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-[13px] font-medium text-bone transition-all hover:bg-orange-dark"
              >
                <Search className="size-4" aria-hidden="true" />
                Check a prospect
              </Link>
              <Link
                href="/leads/new"
                className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-bone transition-all hover:bg-ink/90"
              >
                <Plus className="size-4" aria-hidden="true" />
                New lead
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Mobile spacer */}
      <div className="h-4 lg:hidden" />
    </div>
  )
}
