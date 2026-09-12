import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { REPLY_RATE_TARGET, READ_TO_CHECK_TARGET } from '@/lib/ai/config'
import { LeadList } from '@/components/lead-list'
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
  const { mine, team } = dashboard

  const firstName = user?.rep.name.split(' ')[0] ?? 'there'
  const sendPct = Math.min(Math.round((mine.todaySends / mine.dailyLimit) * 100), 100)
  const atCeiling = mine.todaySends >= mine.dailyLimit
  const sendsLeft = Math.max(0, mine.dailyLimit - mine.todaySends)
  const queue = [...mine.queue].sort(
    (a, b) =>
      (b.score ?? 0) - (a.score ?? 0) ||
      b.createdAt.localeCompare(a.createdAt),
  )

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

      <section className="grid grid-cols-1 gap-6 border-y border-line py-5 sm:grid-cols-3 sm:gap-4">
        <Stat
          label="Sends today"
          value={String(mine.todaySends)}
          sub={`of ${mine.dailyLimit}`}
          progress={sendPct}
          tone={atCeiling ? 'warn' : 'gold'}
          footer={atCeiling ? 'Ceiling reached. Sends resume tomorrow.' : `${sendsLeft} left today`}
        />
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
      </section>

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
    </div>
  )
}
