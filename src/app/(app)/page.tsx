import Link from 'next/link'
import {
  ArrowRight,
  MessageCircle,
  Plus,
  Sparkles,
  TrendingUp,
  Sun,
  Sunset,
  Moon,
  Zap,
  Activity,
  ChevronRight,
  Clock,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { signalById } from '@/lib/score/signals'
import { NotificationFeed, type NotificationItem } from '@/components/notification-feed'
import { ScoreRing } from '@/components/score-ring'
import { cn } from 'cn'
import type { Lead } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

function timeContext(): { label: string; icon: LucideIcon; sub: string } {
  const h = new Date().getHours()
  if (h < 5) return { label: 'Good evening', icon: Moon, sub: 'The queue will be fresh in the morning.' }
  if (h < 12) return { label: 'Good morning', icon: Sun, sub: 'A fresh queue. Start at the top.' }
  if (h < 17) return { label: 'Good afternoon', icon: Sun, sub: 'Keep the momentum going.' }
  if (h < 21) return { label: 'Good evening', icon: Sunset, sub: 'Wrap up strong.' }
  return { label: 'Good evening', icon: Moon, sub: 'The queue will be fresh in the morning.' }
}

type ReasonTag = 'replied' | 'followup' | 'new'

interface PriorityItem {
  lead: Lead
  reason: ReasonTag
  detail: string
}

const REASON_META: Record<ReasonTag, { label: string; className: string; icon: LucideIcon }> = {
  replied: { label: 'Replied', className: 'border-status-send/20 bg-status-send/8 text-status-send', icon: MessageCircle },
  followup: { label: 'Follow-up due', className: 'border-status-research/20 bg-status-research/8 text-status-research', icon: Clock },
  new: { label: 'New lead', className: 'border-line bg-paper-tint text-slate', icon: Target },
}

export default async function TodayPage() {
  const user = await getCurrentUser()
  const store = await createScoutStore()
  const dash = await store.getTodayDashboard()
  const { mine, sendBudgets, notifications, followupsDue, team } = dash

  const firstName = user?.rep.name.split(' ')[0] ?? 'there'
  const time = timeContext()

  const coldQueue = [...mine.queue].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0) || b.createdAt.localeCompare(a.createdAt),
  )
  const followupIds = new Set(followupsDue.map((f) => f.lead.id))

  const priority: PriorityItem[] = [
    ...mine.replies.map((lead) => ({
      lead,
      reason: 'replied' as const,
      detail: 'They wrote back. Answer them first.',
    })),
    ...followupsDue.map((f) => ({
      lead: f.lead,
      reason: 'followup' as const,
      detail: `Contacted ${f.daysSinceContact} days ago, no reply yet.`,
    })),
    ...coldQueue
      .filter((lead) => !followupIds.has(lead.id))
      .map((lead) => ({
        lead,
        reason: 'new' as const,
        detail: signalById(lead.signalType)?.description ?? 'Scored and ready to work.',
      })),
  ]

  const [next, ...rest] = priority
  const replyCount = mine.replies.length
  const followupCount = followupsDue.length

  const knownLeads = new Map(priority.map((p) => [p.lead.id, p.lead.company]))
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

  const sendsLeftToday = sendBudgets.reduce((sum, b) => sum + Math.max(0, b.limit - b.used), 0)
  const atAnyCeiling = sendBudgets.some((b) => b.used >= b.limit)
  const dailyLimit = sendBudgets.reduce((sum, b) => sum + b.limit, 0)
  const replyRatePct = team.replyRate !== null ? Math.round(team.replyRate * 100) : null

  return (
    <div className="space-y-4">

      {/* ═══════════════════════════════════════════════════════
          HEADER — greeting, send budget, new lead
          ═══════════════════════════════════════════════════════ */}
      <header className="reveal-up flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gold/20 via-gold/10 to-transparent text-gold ring-1 ring-gold/15">
            <time.icon className="size-5" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-display text-2xl text-ink sm:text-3xl">{firstName}</h1>
            <p className="text-sm text-slate">{time.sub}</p>
          </div>
        </div>
        <Link
          href="/leads/new"
          className="group inline-flex items-center gap-2 rounded-xl gradient-gold px-5 py-2.5 text-sm font-semibold text-paper transition-all duration-300 hover:shadow-gold active:scale-[0.97]"
        >
          <Plus className="size-4 transition-transform duration-300 group-hover:rotate-90" aria-hidden="true" />
          New lead
        </Link>
      </header>

      {/* ═══════════════════════════════════════════════════════
          PRIMARY ACTION AREA — replies, follow-ups, next lead
          ═══════════════════════════════════════════════════════ */}
      {(replyCount > 0 || followupCount > 0 || next) && (
        <div className="reveal-up stagger-1 grid gap-4 lg:grid-cols-3">
          {/* Replies waiting */}
          <ActionCard
            title="Replies waiting"
            count={replyCount}
            tone="hot"
            icon={<MessageCircle className="size-4" />}
            description={replyCount > 0 ? 'Someone wrote back. Answer them first.' : 'No replies yet.'}
            leads={mine.replies}
            actionLabel="Open reply"
          />

          {/* Follow-ups due */}
          <ActionCard
            title="Follow-ups due"
            count={followupCount}
            tone="warn"
            icon={<Clock className="size-4" />}
            description={followupCount > 0 ? 'Going cold — a nudge now beats losing it.' : 'Nothing overdue.'}
            leads={followupsDue.map((f) => f.lead)}
            actionLabel="Send follow-up"
          />

          {/* Next best lead */}
          <div className={cn(
            'rounded-2xl border bg-surface-raised p-5 transition-all duration-300',
            next ? 'border-gold/20 hover:border-gold/40 hover:shadow-[0_4px_24px_-8px_color-mix(in_srgb,var(--gold)_20%,transparent)]' : 'border-dashed border-line',
          )}>
            {next ? (
              <>
                <div className="flex items-center gap-2 text-slate">
                  <Target className="size-4" />
                  <span className="text-label">Next up</span>
                  <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1', REASON_META[next.reason].className)}>
                    {REASON_META[next.reason].label}
                  </span>
                </div>
                <Link href={`/leads/${next.lead.id}`} className="mt-3 block group">
                  <div className="flex items-center gap-3">
                    {next.lead.score !== null && <ScoreRing score={next.lead.score} size={48} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium text-ink transition-colors group-hover:text-gold">
                        {next.lead.company}
                      </p>
                      {next.lead.contactName && (
                        <p className="truncate text-sm text-slate">{next.lead.contactName}</p>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate">{next.detail}</p>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-gold transition-transform group-hover:translate-x-0.5">
                    Open and draft <ArrowRight className="size-3.5" />
                  </span>
                </Link>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-slate">
                  <Target className="size-4" />
                  <span className="text-label">Next up</span>
                </div>
                <p className="mt-3 text-sm text-slate">No new leads in the queue.</p>
                <Link href="/leads/new" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-gold">
                  Add a lead <ArrowRight className="size-3.5" />
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          NOTIFICATIONS
          ═══════════════════════════════════════════════════════ */}
      {notificationItems.length > 0 && (
        <div className="reveal-up stagger-2">
          <NotificationFeed initial={notificationItems} />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          QUEUE — ranked list
          ═══════════════════════════════════════════════════════ */}
      {rest.length > 0 && (
        <section className="reveal-up stagger-3">
          <div className="flex items-center justify-between px-1 mb-3">
            <h2 className="text-label">Queue</h2>
            <span className="text-mono-medium text-xs text-slate">{rest.length} remaining</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line/80 bg-surface-raised">
            <ul className="divide-y divide-line/50">
              {rest.map(({ lead, reason, detail }, i) => (
                <li key={lead.id} className="slide-in-right" style={{ animationDelay: `${0.03 + i * 0.02}s` }}>
                  <Link
                    href={`/leads/${lead.id}`}
                    className="group flex items-center gap-3 px-4 py-3 transition-all duration-200 hover:bg-paper-tint/30"
                  >
                    {/* Priority number or score */}
                    {lead.score !== null ? (
                      <div className="shrink-0 opacity-50 transition-all duration-300 group-hover:opacity-100 group-hover:scale-110">
                        <ScoreRing score={lead.score} size={38} />
                      </div>
                    ) : (
                      <div className="flex size-[38px] shrink-0 items-center justify-center rounded-full border border-dashed border-line">
                        <Target className="size-3.5 text-slate" />
                      </div>
                    )}

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink transition-colors group-hover:text-gold">
                          {lead.company}
                        </span>
                        <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ring-1', REASON_META[reason].className)}>
                          {REASON_META[reason].label}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate">{detail}</p>
                    </div>

                    <ChevronRight className="size-3.5 text-line/50 transition-all duration-200 group-hover:text-gold group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          CONTEXT STRIP — sends, reply rate, team
          ═══════════════════════════════════════════════════════ */}
      <div className="reveal-up stagger-4 grid gap-px overflow-hidden rounded-2xl border border-line/60 bg-line/40 sm:grid-cols-3">
        <ContextStat
          icon={<Zap className="size-3.5" />}
          label="Sends left"
          value={atAnyCeiling ? 'At limit' : `${sendsLeftToday}`}
          sub={atAnyCeiling ? 'Resumes tomorrow' : `of ${dailyLimit} today`}
          tone={atAnyCeiling ? 'warn' : 'default'}
        />
        <ContextStat
          icon={<Activity className="size-3.5" />}
          label="Queue size"
          value={`${priority.length}`}
          sub={`${replyCount} hot · ${followupCount} due`}
          tone={replyCount > 0 ? 'hot' : 'default'}
        />
        <ContextStat
          icon={<TrendingUp className="size-3.5" />}
          label="Reply rate"
          value={replyRatePct !== null ? `${replyRatePct}%` : '—'}
          sub={replyRatePct !== null && replyRatePct >= 20 ? 'On target' : 'Building data'}
          tone={replyRatePct !== null && replyRatePct >= 20 ? 'good' : 'default'}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════
          EMPTY STATE
          ═══════════════════════════════════════════════════════ */}
      {!next && rest.length === 0 && (
        <section className="reveal-up stagger-3 rounded-2xl border border-dashed border-line/80 bg-surface-raised p-10 text-center">
          <div className="mx-auto max-w-sm space-y-4">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gold/15 to-gold/5 ring-1 ring-gold/10">
              <Sparkles className="size-6 text-gold" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-medium text-ink">Nothing to work right now.</p>
              <p className="text-sm leading-relaxed text-slate">
                Paste research on a company you think needs delivery help.
              </p>
            </div>
            <Link href="/leads/new" className="inline-flex items-center gap-2 rounded-xl gradient-gold px-6 py-3 text-sm font-semibold text-paper transition-all hover:shadow-gold">
              <Plus className="size-4" aria-hidden="true" />
              Add your first lead
            </Link>
          </div>
        </section>
      )}

      {/* Mobile spacer */}
      <div className="h-4 lg:hidden" />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════ */

function ActionCard({
  title,
  count,
  tone,
  icon,
  description,
  leads,
  actionLabel,
}: {
  title: string
  count: number
  tone: 'hot' | 'warn' | 'default'
  icon: React.ReactNode
  description: string
  leads: Lead[]
  actionLabel: string
}) {
  const borderColor = tone === 'hot' ? 'border-status-send/20' : tone === 'warn' ? 'border-status-research/20' : 'border-line'
  const bgGlow = tone === 'hot' ? 'bg-status-send/[0.03]' : tone === 'warn' ? 'bg-status-research/[0.03]' : ''

  return (
    <div className={cn(
      'rounded-2xl border bg-surface-raised p-5 transition-all duration-300 hover:shadow-md',
      borderColor, bgGlow,
    )}>
      <div className="flex items-center gap-2">
        <span className={cn(
          'shrink-0',
          tone === 'hot' ? 'text-status-send' : tone === 'warn' ? 'text-status-research' : 'text-slate',
        )}>{icon}</span>
        <span className="text-label">{title}</span>
        {count > 0 && (
          <span className={cn(
            'ml-auto rounded-full px-2 py-0.5 font-mono text-xs font-medium',
            tone === 'hot' ? 'bg-status-send/10 text-status-send' : tone === 'warn' ? 'bg-status-research/10 text-status-research' : 'bg-paper-tint text-slate',
          )}>
            {count}
          </span>
        )}
      </div>

      {count > 0 && leads[0] ? (
        <Link href={`/leads/${leads[0].id}`} className="mt-3 block group">
          <p className="text-base font-medium text-ink transition-colors group-hover:text-gold">
            {leads[0].company}
          </p>
          {leads[0].contactName && (
            <p className="text-sm text-slate">{leads[0].contactName}</p>
          )}
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate">{description}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-gold transition-transform group-hover:translate-x-0.5">
            {actionLabel} <ArrowRight className="size-3.5" />
          </span>
        </Link>
      ) : (
        <>
          <p className="mt-3 text-sm text-slate">{description}</p>
          <Link href="/leads/new" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-gold">
            Add a lead <ArrowRight className="size-3.5" />
          </Link>
        </>
      )}

      {count > 1 && (
        <p className="mt-3 border-t border-line/40 pt-2 text-xs text-slate">
          +{count - 1} more {count - 1 === 1 ? 'lead' : 'leads'}
        </p>
      )}
    </div>
  )
}

function ContextStat({
  icon,
  label,
  value,
  sub,
  tone = 'default',
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'hot' | 'warn' | 'good'
}) {
  const valueColor = {
    default: 'text-ink',
    hot: 'text-status-send',
    warn: 'text-status-research',
    good: 'text-status-send',
  }[tone]

  return (
    <div className="flex flex-col gap-1 bg-paper px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-slate">
        {icon}
        <span className="text-label">{label}</span>
      </div>
      <span className={cn('font-mono text-xl font-medium tracking-tight', valueColor)}>{value}</span>
      {sub && <p className="text-[11px] text-slate">{sub}</p>}
    </div>
  )
}
