import Link from 'next/link'
import { Briefcase, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { REPLY_RATE_TARGET, READ_TO_CHECK_TARGET } from '@/lib/ai/config'
import { LeadList } from '@/components/lead-list'
import { NotificationFeed, type NotificationItem } from '@/components/notification-feed'
import { cn } from 'cn'

export const dynamic = 'force-dynamic'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Good evening'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function pct(n: number | null): string {
  return n === null ? 'no data' : `${Math.round(n * 100)}%`
}

function Stat({
  label,
  value,
  sub,
  footer,
  progress,
  tone = 'neutral',
}: {
  label: string
  value: string
  sub?: string
  footer?: string
  progress?: number
  tone?: 'neutral' | 'gold' | 'warn'
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate">
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className={cn(
            'font-mono text-2xl font-medium',
            tone === 'gold' ? 'text-gold' : tone === 'warn' ? 'text-status-research' : 'text-ink',
          )}
        >
          {value}
        </span>
        {sub ? <span className="text-xs text-slate">{sub}</span> : null}
      </div>
      {typeof progress === 'number' ? (
        <div className="mt-2.5 h-1 w-full max-w-32 overflow-hidden rounded-full bg-paper-tint">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300',
              tone === 'warn' ? 'bg-status-research' : 'bg-gold',
            )}
            style={{ width: `${Math.min(Math.max(progress, 2), 100)}%` }}
          />
        </div>
      ) : null}
      {footer ? (
        <p className={cn('mt-1.5 text-xs', tone === 'warn' ? 'text-status-research' : 'text-slate')}>
          {footer}
        </p>
      ) : null}
    </div>
  )
}

export default async function TodayPage() {
  const user = await getCurrentUser()
  const store = await createScoutStore()
  const dashboard = await store.getTodayDashboard()
  const { mine, team, sendBudgets, notifications, followupsDue, myRank, upwork } = dashboard

  const firstName = user?.rep.name.split(' ')[0] ?? 'there'
  const queue = [...mine.queue].sort(
    (a, b) =>
      (b.score ?? 0) - (a.score ?? 0) ||
      b.createdAt.localeCompare(a.createdAt),
  )

  // Resolve each notification's lead_id to a company name from data already
  // on hand (owned leads + queue + replies), rather than an extra query —
  // notifications almost always point at a lead this rep already owns.
  const knownLeads = new Map(
    [...mine.queue, ...mine.replies, ...followupsDue.map((f) => f.lead)].map((l) => [l.id, l.company]),
  )
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

  const rankLabel =
    myRank.position && myRank.ofTotal > 1
      ? `#${myRank.position} of ${myRank.ofTotal} on the team`
      : null
  const mineReplyRate = myRank.mine?.replyRate ?? null
  const teamReplyRate = myRank.teamAverage.replyRate
  const aboveTeam =
    mineReplyRate !== null && teamReplyRate !== null ? mineReplyRate >= teamReplyRate : null

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1.5 font-mono text-xs text-slate">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
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

      <section className="grid grid-cols-1 gap-6 border-y border-line py-5 sm:grid-cols-2 lg:grid-cols-5 sm:gap-4">
        {sendBudgets.map((budget) => {
          const used = budget.used
          const atCeiling = used >= budget.limit
          const budgetPct = Math.min(Math.round((used / budget.limit) * 100), 100)
          return (
            <Stat
              key={budget.label}
              label={budget.label}
              value={String(used)}
              sub={`of ${budget.limit}`}
              progress={budgetPct}
              tone={atCeiling ? 'warn' : 'gold'}
              footer={atCeiling ? 'Ceiling reached today.' : `${budget.limit - used} left today`}
            />
          )
        })}
        <Stat
          label="Team reply rate"
          value={pct(team.replyRate)}
          sub={`target ${pct(REPLY_RATE_TARGET)}`}
          footer={`${team.repliedLeads} replied across ${team.sentLeads} sent lines`}
        />
        <Stat
          label="Read to check"
          value={pct(team.readToCheckRate)}
          sub={`target ${pct(READ_TO_CHECK_TARGET)}`}
          footer={`${team.checkedLeads} checks from ${team.readLeads} reads`}
        />
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate">You vs team</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-medium text-ink">{pct(mineReplyRate)}</span>
            {aboveTeam !== null ? (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-xs',
                  aboveTeam ? 'text-status-send' : 'text-status-research',
                )}
              >
                {aboveTeam ? (
                  <TrendingUp className="size-3.5" aria-hidden="true" />
                ) : (
                  <TrendingDown className="size-3.5" aria-hidden="true" />
                )}
                team {pct(teamReplyRate)}
              </span>
            ) : (
              <span className="text-xs text-slate">no sends yet</span>
            )}
          </div>
          {rankLabel ? (
            <p className="mt-1.5 text-xs text-slate">
              <Link href="/team" className="hover:text-ink hover:underline">
                {rankLabel}
              </Link>
            </p>
          ) : null}
        </div>
      </section>

      {followupsDue.length > 0 ? (
        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-medium text-ink">Follow-ups due</h2>
                <span className="rounded-full bg-status-research/15 px-2 py-0.5 text-[11px] font-medium text-status-research">
                  {followupsDue.length}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate">
                Contacted 3+ days ago with no reply yet. A nudge now beats letting it go cold.
              </p>
            </div>
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line bg-paper">
            {followupsDue.map((f) => (
              <li key={f.lead.id}>
                <Link
                  href={`/leads/${f.lead.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-paper-tint"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{f.lead.company}</div>
                    {f.lead.contactName ? (
                      <div className="mt-0.5 truncate text-xs text-slate">{f.lead.contactName}</div>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-mono text-xs text-status-research">
                    {f.daysSinceContact}d since contact
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mine.replies.length > 0 ? (
        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-medium text-ink">Replies waiting</h2>
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold">
                  {mine.replies.length} warm
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate">
                These leads already replied. Answer them first, before the cold queue.
              </p>
            </div>
          </div>
          <LeadList leads={mine.replies} showRepliedOnly />
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-ink">Your queue</h2>
            <p className="mt-0.5 text-sm text-slate">
              Ordered by score. Start at the top and work down.
            </p>
          </div>
          <span className="font-mono text-xs text-slate">{queue.length} leads</span>
        </div>
        {queue.length === 0 ? (
          <div className="space-y-4 border-y border-dashed border-line py-8 text-center">
            <div>
              <p className="text-sm font-medium text-ink">Nothing queued yet.</p>
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
              Add the first lead
            </Link>
          </div>
        ) : (
          <LeadList leads={queue} highlightTop />
        )}
      </section>

      {upwork.queue.length > 0 ? (
        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div className="flex items-center gap-2">
              <Briefcase className="size-4 text-slate" aria-hidden="true" />
              <div>
                <h2 className="text-base font-medium text-ink">Upwork jobs waiting</h2>
                <p className="mt-0.5 text-sm text-slate">
                  {upwork.todayApplies > 0
                    ? `${upwork.todayApplies} applied today, sharing your connection budget above.`
                    : 'Scored the same way as leads. Sharing your connection budget above.'}
                </p>
              </div>
            </div>
            <Link
              href="/upwork"
              className="shrink-0 text-xs font-medium text-gold underline-offset-4 hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line bg-paper">
            {upwork.queue.slice(0, 5).map((job) => (
              <li key={job.id}>
                <Link
                  href={`/upwork/${job.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-paper-tint"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{job.title}</div>
                    <div className="mt-0.5 truncate text-xs text-slate">
                      {job.budgetMin && job.budgetMax
                        ? `$${job.budgetMin}-$${job.budgetMax} fixed`
                        : job.hourlyRateMin && job.hourlyRateMax
                          ? `$${job.hourlyRateMin}-$${job.hourlyRateMax}/hr`
                          : 'Budget not stated'}
                      {' · '}
                      {job.connectsCost} Connects
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
                      job.verdict === 'apply'
                        ? 'bg-status-send/10 text-status-send'
                        : job.verdict === 'apply_if_connects'
                          ? 'bg-status-research/10 text-status-research'
                          : 'bg-line/50 text-slate',
                    )}
                  >
                    {job.score ?? '-'} / 10
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
