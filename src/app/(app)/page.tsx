import Link from 'next/link'
import { ArrowRight, MessageCircle, Plus, Sparkles } from 'lucide-react'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { signalById } from '@/lib/score/signals'
import { NotificationFeed, type NotificationItem } from '@/components/notification-feed'
import { cn } from 'cn'
import type { Lead } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Good evening'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

type ReasonTag = 'replied' | 'followup' | 'new'

interface PriorityItem {
  lead: Lead
  reason: ReasonTag
  detail: string
}

const REASON_LABEL: Record<ReasonTag, { label: string; tone: string }> = {
  replied: { label: 'Replied', tone: 'bg-status-send/10 text-status-send' },
  followup: { label: 'Needs a follow-up', tone: 'bg-status-research/10 text-status-research' },
  new: { label: 'New', tone: 'bg-paper-tint text-slate' },
}

export default async function TodayPage() {
  const user = await getCurrentUser()
  const store = await createScoutStore()
  const dashboard = await store.getTodayDashboard()
  const { mine, sendBudgets, notifications, followupsDue, team } = dashboard

  const firstName = user?.rep.name.split(' ')[0] ?? 'there'

  // One ranked list, one story: someone waiting on you beats a lead going
  // cold beats a fresh lead sitting in the queue. No separate sections for a
  // rep to reconcile — just the order to work in.
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

  // Resolve each notification's lead_id to a company name from data already
  // on hand, rather than an extra query.
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

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1.5 text-sm text-slate">
            {atAnyCeiling
              ? "You've hit a send limit today. It resumes tomorrow."
              : `${sendsLeftToday} sends left today`}
            {team.replyRate !== null ? ` · team is replying ${Math.round(team.replyRate * 100)}% of the time` : ''}
          </p>
        </div>
        <Link
          href="/leads/new"
          className="inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-gold/90"
        >
          <Plus className="size-4" aria-hidden="true" />
          New lead
        </Link>
      </header>

      {notificationItems.length > 0 ? <NotificationFeed initial={notificationItems} /> : null}

      {next ? (
        <section className="rounded-2xl border-2 border-gold/40 bg-paper p-6 sm:p-8">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gold">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Work this one next
          </div>
          <div className="mt-3 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-medium tracking-tight text-ink sm:text-2xl">
                {next.lead.company}
              </h2>
              {next.lead.contactName ? (
                <p className="mt-1 text-sm text-slate">
                  {next.lead.contactName}
                  {next.lead.contactTitle ? ` · ${next.lead.contactTitle}` : ''}
                </p>
              ) : null}
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink">{next.detail}</p>
            </div>
            <Link
              href={`/leads/${next.lead.id}`}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-medium text-paper transition-colors hover:bg-gold/90"
            >
              {next.reason === 'replied' ? (
                <>
                  <MessageCircle className="size-4" aria-hidden="true" />
                  Reply now
                </>
              ) : (
                <>
                  Open and draft a message
                  <ArrowRight className="size-4" aria-hidden="true" />
                </>
              )}
            </Link>
          </div>
        </section>
      ) : (
        <section className="space-y-4 border-y border-dashed border-line py-10 text-center">
          <div>
            <p className="text-sm font-medium text-ink">Nothing to work right now.</p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate">
              Paste research on a company you think needs delivery help, and Relay
              scores it before you spend a minute on it.
            </p>
          </div>
          <Link
            href="/leads/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-gold/90"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add your first lead
          </Link>
        </section>
      )}

      {rest.length > 0 ? (
        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <h2 className="text-sm font-medium text-slate">Then, in order</h2>
            <span className="font-mono text-xs text-slate">{rest.length} more</span>
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line bg-paper">
            {rest.map(({ lead, reason, detail }) => (
              <li key={lead.id}>
                <Link
                  href={`/leads/${lead.id}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-paper-tint"
                >
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                      REASON_LABEL[reason].tone,
                    )}
                  >
                    {REASON_LABEL[reason].label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{lead.company}</div>
                    <div className="mt-0.5 truncate text-xs text-slate">
                      {lead.contactName ?? detail}
                    </div>
                  </div>
                  {lead.score !== null ? (
                    <span className="shrink-0 font-mono text-xs text-slate">{lead.score}/12</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
