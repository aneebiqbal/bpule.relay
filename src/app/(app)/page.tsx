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
  Flame,
  Zap,
  BarChart3,
  Activity,
  ChevronRight,
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

/* ── Time helpers ── */
function timeContext(): { label: string; icon: LucideIcon; sub: string; vibe: string } {
  const h = new Date().getHours()
  if (h < 5) return { label: 'Good evening', icon: Moon, sub: 'The queue will be fresh in the morning.', vibe: 'night' }
  if (h < 12) return { label: 'Good morning', icon: Sun, sub: 'A fresh queue. Start at the top.', vibe: 'morning' }
  if (h < 17) return { label: 'Good afternoon', icon: Sun, sub: 'Keep the momentum going.', vibe: 'afternoon' }
  if (h < 21) return { label: 'Good evening', icon: Sunset, sub: 'Wrap up strong.', vibe: 'evening' }
  return { label: 'Good evening', icon: Moon, sub: 'The queue will be fresh in the morning.', vibe: 'night' }
}

type ReasonTag = 'replied' | 'followup' | 'new'

interface PriorityItem {
  lead: Lead
  reason: ReasonTag
  detail: string
}

const REASON_META: Record<ReasonTag, { label: string; className: string; dotColor: string }> = {
  replied: { label: 'Replied', className: 'border-status-send/20 bg-status-send/8 text-status-send', dotColor: 'bg-status-send' },
  followup: { label: 'Follow-up due', className: 'border-status-research/20 bg-status-research/8 text-status-research', dotColor: 'bg-status-research' },
  new: { label: 'New', className: 'border-line bg-paper-tint text-slate', dotColor: 'bg-slate-light' },
}

/* ═══════════════════════════════════════════════════════════ */

export default async function TodayPage() {
  const user = await getCurrentUser()
  const store = await createScoutStore()
  const dash = await store.getTodayDashboard()
  const { mine, sendBudgets, notifications, followupsDue, team } = dash

  const firstName = user?.rep.name.split(' ')[0] ?? 'there'
  const time = timeContext()

  /* ── Build priority queue ── */
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
      detail: `Contacted ${f.daysSinceContact} days ago, no reply yet. A nudge now beats letting it go cold.`,
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

  /* ── Notifications ── */
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

  /* ── Stats ── */
  const sendsLeftToday = sendBudgets.reduce((sum, b) => sum + Math.max(0, b.limit - b.used), 0)
  const atAnyCeiling = sendBudgets.some((b) => b.used >= b.limit)
  const dailyLimit = sendBudgets.reduce((sum, b) => sum + b.limit, 0)
  const replyRatePct = team.replyRate !== null ? Math.round(team.replyRate * 100) : null

  return (
    <div className="space-y-5">

      {/* ═══════════════════════════════════════════════════════
          HERO
          ═══════════════════════════════════════════════════════ */}
      <header className="reveal-up relative overflow-hidden rounded-[1.75rem] border border-line/80 bg-surface-raised p-6 sm:p-8 gradient-mesh">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -right-32 -top-32 size-80 rounded-full bg-gold/[0.07] blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 size-72 rounded-full bg-gold/[0.05] blur-[80px]" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          {/* Greeting */}
          <div className="flex items-center gap-5">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gold/15 via-gold/8 to-transparent text-gold ring-1 ring-gold/10 sm:size-16">
              <time.icon className="size-6" strokeWidth={1.5} />
            </div>

            <div>
              <p className="text-label mb-0.5">{time.label}</p>
              <h1 className="text-display text-4xl text-ink sm:text-5xl">
                {firstName}
              </h1>
              <p className="mt-1 text-[15px] text-slate">{time.sub}</p>
            </div>
          </div>

          {/* CTA */}
          <Link
            href="/leads/new"
            className="group inline-flex items-center gap-3 rounded-2xl gradient-gold px-7 py-4 text-sm font-semibold text-paper transition-all duration-300 hover:shadow-gold active:scale-[0.97]"
          >
            <Plus className="size-[18px] transition-transform duration-300 group-hover:rotate-90" aria-hidden="true" />
            New lead
          </Link>
        </div>

        {/* Stats bar */}
        <div className="relative mt-7 flex flex-wrap items-center gap-5 border-t border-line/60 pt-6">
          <QuickStat
            icon={<Zap className="size-3.5" />}
            value={atAnyCeiling ? 'Limit' : `${sendsLeftToday}`}
            label="sends left"
            tone={atAnyCeiling ? 'warn' : 'default'}
            sub={atAnyCeiling ? 'Resumes tomorrow' : `of ${dailyLimit} today`}
          />
          <HDivider />
          <QuickStat
            icon={<Activity className="size-3.5" />}
            value={`${priority.length}`}
            label="in queue"
            tone={mine.replies.length > 0 ? 'hot' : 'default'}
            sub={`${mine.replies.length} hot · ${followupsDue.length} due`}
          />
          <HDivider />
          <QuickStat
            icon={<TrendingUp className="size-3.5" />}
            value={replyRatePct !== null ? `${replyRatePct}%` : '—'}
            label="reply rate"
            tone={replyRatePct !== null && replyRatePct >= 20 ? 'good' : 'default'}
            sub={replyRatePct !== null && replyRatePct >= 20 ? 'On target' : 'Building data'}
          />
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════
          NOTIFICATIONS
          ═══════════════════════════════════════════════════════ */}
      {notificationItems.length > 0 && (
        <div className="reveal-up stagger-2">
          <NotificationFeed initial={notificationItems} />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          SPOTLIGHT
          ═══════════════════════════════════════════════════════ */}
      {next ? (
        <section className="reveal-up stagger-3 group relative overflow-hidden rounded-[1.75rem] border border-gold/15 bg-surface-raised">
          {/* Gold top accent line */}
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

          {/* Ambient */}
          <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-gold/[0.08] blur-[80px]" />
          <div className="pointer-events-none absolute -bottom-28 right-16 size-56 rounded-full bg-gold/[0.05] blur-[60px]" />

          <div className="relative p-6 sm:p-8 lg:p-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              {/* Lead info */}
              <div className="flex-1 space-y-6">
                {/* Badges */}
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-2 rounded-full bg-gold/8 px-3.5 py-1.5 text-label text-gold ring-1 ring-gold/10">
                    <span className="size-1.5 rounded-full bg-gold gentle-pulse" aria-hidden="true" />
                    Work this next
                  </span>
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ring-1',
                    REASON_META[next.reason].className,
                  )}>
                    {REASON_META[next.reason].label}
                  </span>
                </div>

                {/* Company */}
                <div>
                  <h2 className="text-heading text-3xl text-ink sm:text-4xl">
                    {next.lead.company}
                  </h2>
                  {next.lead.contactName && (
                    <p className="mt-2 flex items-center gap-2 text-[15px] text-slate">
                      <span className="font-medium text-ink-soft">{next.lead.contactName}</span>
                      {next.lead.contactTitle && (
                        <>
                          <span className="text-line">·</span>
                          <span>{next.lead.contactTitle}</span>
                        </>
                      )}
                    </p>
                  )}
                </div>

                {/* Detail */}
                <p className="max-w-lg text-[15px] leading-relaxed text-ink/70">
                  {next.detail}
                </p>

                {/* Meta chips */}
                <div className="flex flex-wrap items-center gap-2">
                  {next.lead.signalType && (
                    <Chip>
                      <Flame className="size-3 text-gold" />
                      {signalById(next.lead.signalType)?.short ?? 'Signal'}
                    </Chip>
                  )}
                  {next.lead.score !== null && (
                    <Chip>
                      <BarChart3 className="size-3 text-slate" />
                      <span className="text-mono-medium">{next.lead.score}/12</span>
                    </Chip>
                  )}
                  {next.lead.locationRaw && (
                    <Chip>{next.lead.locationRaw}</Chip>
                  )}
                </div>
              </div>

              {/* Score + CTA */}
              <div className="flex shrink-0 flex-col items-center gap-5 lg:items-end">
                {next.lead.score !== null && (
                  <div className="relative transition-transform duration-500 group-hover:scale-105">
                    <ScoreRing score={next.lead.score} size={100} />
                    <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-2.5 py-0.5 text-mono-medium text-[9px] text-paper">
                      {next.lead.score >= 10 ? 'Strong' : next.lead.score >= 7 ? 'Good' : next.lead.score >= 4 ? 'Fair': 'Weak'}
                    </div>
                  </div>
                )}
                <Link
                  href={`/leads/${next.lead.id}`}
                  className="group/btn inline-flex shrink-0 items-center gap-3 rounded-2xl bg-ink px-8 py-4 text-sm font-medium text-paper transition-all duration-300 hover:bg-ink/90 hover:shadow-lg active:scale-[0.97]"
                >
                  {next.reason === 'replied' ? (
                    <>
                      <MessageCircle className="size-4" aria-hidden="true" />
                      Open reply context
                    </>
                  ) : (
                    <>
                      Open and draft a message
                      <ArrowRight className="size-4 transition-transform duration-200 group-hover/btn:translate-x-1" aria-hidden="true" />
                    </>
                  )}
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : (
        /* Empty state */
        <section className="reveal-up stagger-3 relative overflow-hidden rounded-[1.75rem] border border-dashed border-line/80 bg-surface-raised p-16 text-center">
          <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 size-56 rounded-full bg-gold/[0.1] blur-[80px]" />
          <div className="relative mx-auto max-w-md space-y-5">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gold/12 to-gold/4 ring-1 ring-gold/10">
              <Sparkles className="size-7 text-gold" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <p className="text-heading text-xl text-ink">Nothing to work right now.</p>
              <p className="text-sm leading-relaxed text-slate">
                Paste research on a company you think needs delivery help, and Relay
                scores it before you spend a minute on it.
              </p>
            </div>
            <Link
              href="/leads/new"
              className="inline-flex items-center gap-2.5 rounded-2xl gradient-gold px-7 py-3.5 text-sm font-semibold text-paper transition-all duration-300 hover:shadow-gold"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add your first lead
            </Link>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          QUEUE
          ═══════════════════════════════════════════════════════ */}
      {rest.length > 0 && (
        <section className="reveal-up stagger-4 space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-label">Then, in order</h2>
              <span className="rounded-full bg-paper-tint px-2 py-0.5 text-mono-medium text-[10px] text-slate">
                {rest.length}
              </span>
            </div>
            {/* Queue density dots */}
            <div className="flex items-center gap-1" aria-hidden="true">
              {Array.from({ length: Math.min(rest.length, 10) }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'size-[5px] rounded-full transition-colors',
                    i === 0 ? 'bg-gold' : i < 3 ? 'bg-gold/30' : 'bg-line',
                  )}
                />
              ))}
              {rest.length > 10 && (
                <span className="ml-0.5 text-mono-medium text-[9px] text-slate">+{rest.length - 10}</span>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.25rem] border border-line/80 bg-surface-raised">
            <ul className="divide-y divide-line/60">
              {rest.map(({ lead, reason, detail }, i) => (
                <li
                  key={lead.id}
                  className="slide-in-right"
                  style={{ animationDelay: `${0.04 + i * 0.03}s` }}
                >
                  <Link
                    href={`/leads/${lead.id}`}
                    className="group flex items-center gap-4 px-5 py-3.5 transition-all duration-200 hover:bg-paper-tint/40"
                  >
                    {/* Score */}
                    {lead.score !== null ? (
                      <div className="shrink-0 opacity-40 transition-all duration-300 group-hover:opacity-100 group-hover:scale-110">
                        <ScoreRing score={lead.score} size={44} />
                      </div>
                    ) : (
                      <div className="flex size-[44px] shrink-0 items-center justify-center rounded-full border border-dashed border-line">
                        <span className="text-mono-medium text-[10px] text-slate">—</span>
                      </div>
                    )}

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink transition-colors group-hover:text-gold">
                          {lead.company}
                        </span>
                        <span className={cn(
                          'shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ring-1',
                          REASON_META[reason].className,
                        )}>
                          {REASON_META[reason].label}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate">
                        {lead.contactName && <span className="text-slate/70">{lead.contactName}</span>}
                        {lead.contactName && <span className="mx-1.5 text-line">·</span>}
                        {detail}
                      </p>
                    </div>

                    {/* Right side */}
                    <div className="shrink-0 flex items-center gap-3">
                      {lead.score !== null && (
                        <span className="hidden text-mono-medium text-xs text-slate/40 sm:inline">
                          {lead.score}/12
                        </span>
                      )}
                      <ChevronRight className="size-4 text-line/60 transition-all duration-200 group-hover:text-gold group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Mobile spacer */}
      <div className="h-6 lg:hidden" />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════ */

function QuickStat({
  icon,
  value,
  label,
  sub,
  tone = 'default',
}: {
  icon: React.ReactNode
  value: string
  label: string
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
    <div className="flex items-center gap-3">
      <span className={cn('shrink-0', valueColor)} aria-hidden="true">{icon}</span>
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className={cn('text-mono-medium text-xl font-medium tracking-tight', valueColor)}>{value}</span>
          <span className="text-label">{label}</span>
        </div>
        {sub && <p className="text-[11px] text-slate">{sub}</p>}
      </div>
    </div>
  )
}

function HDivider() {
  return <span className="hidden h-5 w-px bg-line/60 sm:block" />
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-paper-tint px-2.5 py-1.5 text-xs text-ink-soft">
      {children}
    </span>
  )
}
