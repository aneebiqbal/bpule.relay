import Link from 'next/link'
import { createScoutStore } from '@/lib/store'
import { REPLY_RATE_TARGET, READ_TO_CHECK_TARGET } from '@/lib/ai/config'
import { TrendingUp, Users, Zap, Clock, DollarSign, Activity } from 'lucide-react'

import { cn } from 'cn'

export const dynamic = 'force-dynamic'

function pct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n * 100)}%`
}

function onTarget(n: number | null, target: number) {
  return n !== null && n >= target
}

export default async function TeamPage() {
  const store = await createScoutStore()
  const [statsRes, extractionRes] = await Promise.allSettled([
    store.getTeamStats(),
    store.getExtractionMetrics(),
  ])
  const stats =
    statsRes.status === 'fulfilled'
      ? statsRes.value
      : {
          overall: {
            sent: 0,
            sentLeads: 0,
            repliedLeads: 0,
            replyRate: null,
            readLeads: 0,
            checkedLeads: 0,
            readToCheckRate: null,
          },
          perRep: [],
          perPlay: [],
        }
  const extraction =
    extractionRes.status === 'fulfilled'
      ? extractionRes.value
      : {
          total: 0,
          failures: 0,
          failureRate: 0,
          avgLatencyMs: 0,
          p95LatencyMs: 0,
          costByTier: { tier1: 0, tier2: 0, tier3: 0, tier4: 0 },
          totalCostUsd: 0,
          requestsByTier: { tier1: 0, tier2: 0, tier3: 0, tier4: 0 },
        }
  const totalRequests = Object.values(extraction.requestsByTier).reduce((sum, n) => sum + n, 0)
  const freeShare = totalRequests > 0 ? extraction.requestsByTier.tier1 / totalRequests : null

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="reveal-up space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Team performance</p>
        <h1 className="text-3xl font-medium tracking-tight text-ink sm:text-4xl">Team</h1>
        <p className="max-w-xl text-sm leading-relaxed text-slate">
          Two numbers tied to defined targets: reply rate against{' '}
          <span className="font-medium text-ink">{pct(REPLY_RATE_TARGET)}</span> and Read-to-Check against{' '}
          <span className="font-medium text-ink">{pct(READ_TO_CHECK_TARGET)}</span>.
        </p>
        {statsRes.status === 'rejected' || extractionRes.status === 'rejected' ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-status-research/10 px-3 py-1.5 text-xs text-status-research">
            Some analytics data could not load — showing partial metrics.
          </p>
        ) : null}
      </header>

      {/* Team overview cards */}
      <div className="reveal-up stagger-1 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<Activity className="size-4" />}
          label="Reply rate"
          value={pct(stats.overall.replyRate)}
          target={`target ${pct(REPLY_RATE_TARGET)}`}
          ok={onTarget(stats.overall.replyRate, REPLY_RATE_TARGET)}
          sub={`${stats.overall.repliedLeads} of ${stats.overall.sentLeads} replied`}
        />
        <MetricCard
          icon={<TrendingUp className="size-4" />}
          label="Read to Check"
          value={pct(stats.overall.readToCheckRate)}
          target={`target ${pct(READ_TO_CHECK_TARGET)}`}
          ok={onTarget(stats.overall.readToCheckRate, READ_TO_CHECK_TARGET)}
          sub={`${stats.overall.checkedLeads} of ${stats.overall.readLeads} checked`}
        />
        <MetricCard
          icon={<Users className="size-4" />}
          label="Messages sent"
          value={String(stats.overall.sent)}
          sub={`across ${stats.overall.sentLeads} leads`}
        />
        <MetricCard
          icon={<Zap className="size-4" />}
          label="Extraction health"
          value={pct(extraction.failureRate)}
          target="fail rate"
          invert
          ok={extraction.total === 0 || extraction.failureRate <= 0.08}
          sub={`${extraction.failures} failed / ${extraction.total} total`}
        />
      </div>

      {/* Latency + Cost row */}
      <div className="reveal-up stagger-2 grid gap-4 sm:grid-cols-2">
        {/* Latency */}
        <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
          <div className="flex items-center gap-2 text-slate">
            <Clock className="size-3.5" />
            <span className="font-mono text-xs uppercase tracking-widest">Extraction latency</span>
          </div>
          <div className="mt-4 flex items-baseline gap-6">
            <div>
              <span className="font-mono text-2xl font-medium text-ink">{extraction.avgLatencyMs}ms</span>
              <span className="ml-2 text-xs text-slate">average</span>
            </div>
            <div>
              <span className="font-mono text-2xl font-medium text-ink">{Math.round(extraction.p95LatencyMs)}ms</span>
              <span className="ml-2 text-xs text-slate">p95</span>
            </div>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper-tint">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                extraction.avgLatencyMs > 0 && extraction.avgLatencyMs <= 4500
                  ? 'bg-status-send'
                  : 'bg-status-research',
              )}
              style={{ width: `${Math.min(100, (extraction.avgLatencyMs / 8000) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate">
            {extraction.avgLatencyMs > 0 && extraction.avgLatencyMs <= 4500
              ? 'Within target range.'
              : 'Above 4.5s target — investigate if sustained.'}
          </p>
        </div>

        {/* Cost */}
        <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate">
              <DollarSign className="size-3.5" />
              <span className="font-mono text-xs uppercase tracking-widest">Model spend (7d)</span>
            </div>
            <span className="font-mono text-lg font-medium text-ink">
              ${extraction.totalCostUsd.toFixed(2)}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {([
              { label: 'Groq (free)', cost: extraction.costByTier.tier1, req: extraction.requestsByTier.tier1 },
              { label: 'DeepSeek Flash', cost: extraction.costByTier.tier2, req: extraction.requestsByTier.tier2 },
              { label: 'DeepSeek Pro', cost: extraction.costByTier.tier3, req: extraction.requestsByTier.tier3 },
              { label: 'OpenAI', cost: extraction.costByTier.tier4, req: extraction.requestsByTier.tier4 },
            ] as const).map((tier) => (
              <div key={tier.label} className="rounded-lg bg-paper-tint/60 px-3 py-2">
                <p className="text-[11px] text-slate">{tier.label}</p>
                <p className="mt-0.5 font-mono text-sm text-ink">${tier.cost.toFixed(2)}</p>
                <p className="font-mono text-[10px] text-slate">{tier.req} req</p>
              </div>
            ))}
          </div>
          {totalRequests > 0 && (
            <p className="mt-3 text-xs text-slate">
              Groq&apos;s free tier served <span className="font-medium text-ink">{pct(freeShare)}</span> of requests.
            </p>
          )}
        </div>
      </div>

      {/* Per rep table */}
      <section className="reveal-up stagger-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-widest text-slate">Per rep</h2>
          <Link
            href="/team/eval"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gold transition-colors hover:text-gold/80"
          >
            Eval harness
            <TrendingUp className="size-3" />
          </Link>
        </div>
        {stats.perRep.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-line bg-paper">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-line bg-paper-tint/40 px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest text-slate">
              <span>Who</span>
              <span className="w-20 text-right">Reply</span>
              <span className="w-20 text-right">R→C</span>
            </div>
            <ul className="divide-y divide-line">
              {stats.perRep.map((row, i) => (
                <li
                  key={row.rep.id}
                  className="slide-in-right grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-paper-tint/30"
                  style={{ animationDelay: `${0.05 + i * 0.04}s` }}
                >
                  <div>
                    <div className="text-sm font-medium text-ink">{row.rep.name}</div>
                    <div className="font-mono text-xs text-slate">{row.rep.role}</div>
                  </div>
                  <RatePill rate={row.replyRate} target={REPLY_RATE_TARGET} className="w-20" />
                  <RatePill rate={row.readToCheckRate} target={READ_TO_CHECK_TARGET} className="w-20" />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line py-10 text-center">
            <p className="text-sm text-slate">No sent lines yet this quarter.</p>
          </div>
        )}
      </section>

      {/* Per play table */}
      {stats.perPlay.length > 0 ? (
        <section className="reveal-up stagger-4 space-y-3">
          <h2 className="font-mono text-xs uppercase tracking-widest text-slate">Per play</h2>
          <div className="overflow-hidden rounded-2xl border border-line bg-paper">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-line bg-paper-tint/40 px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest text-slate">
              <span>Play</span>
              <span className="w-20 text-right">Reply</span>
              <span className="w-20 text-right">R→C</span>
            </div>
            <ul className="divide-y divide-line">
              {stats.perPlay.map((row, i) => (
                <li
                  key={row.play?.id ?? 'none'}
                  className="slide-in-right grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-paper-tint/30"
                  style={{ animationDelay: `${0.05 + i * 0.04}s` }}
                >
                  <div>
                    <div className="text-sm font-medium text-ink">
                      {row.play?.name ?? 'No play assigned'}
                    </div>
                    <div className="text-xs text-slate">
                      {row.play?.situation ?? 'leads without a matched play'}
                    </div>
                  </div>
                  <RatePill rate={row.replyRate} target={REPLY_RATE_TARGET} className="w-20" />
                  <RatePill rate={row.readToCheckRate} target={READ_TO_CHECK_TARGET} className="w-20" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  target,
  sub,
  ok,
  invert = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  target?: string
  sub?: string
  ok?: boolean
  invert?: boolean
}) {
  const color = invert
    ? ok
      ? 'text-status-send'
      : 'text-status-research'
    : ok !== undefined
      ? ok
        ? 'text-status-send'
        : 'text-ink'
      : 'text-ink'

  return (
    <div className="rounded-2xl border border-line bg-paper p-5 gold-glow-hover transition-all duration-300 hover:-translate-y-0.5">
      <div className="flex items-center gap-2 text-slate">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-widest">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={cn('font-mono text-2xl font-medium', color)}>{value}</span>
        {target && <span className="text-[11px] text-slate">{target}</span>}
      </div>
      {sub && <p className="mt-1 text-xs text-slate">{sub}</p>}
    </div>
  )
}

function RatePill({
  rate,
  target,
  className,
}: {
  rate: number | null
  target: number
  className?: string
}) {
  const ok = onTarget(rate, target)
  return (
    <div className={cn('text-right', className)}>
      <span className={cn('font-mono text-sm', ok ? 'text-status-send' : 'text-ink')}>
        {pct(rate)}
      </span>
    </div>
  )
}
