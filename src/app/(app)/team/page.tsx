import Link from 'next/link'
import { createScoutStore } from '@/lib/store'
import { REPLY_RATE_TARGET, READ_TO_CHECK_TARGET } from '@/lib/ai/config'
import type { RateMetric } from '@/lib/store/types'
import { cn } from 'cn'

export const dynamic = 'force-dynamic'

function pct(n: number | null): string {
  return n === null ? 'no data' : `${Math.round(n * 100)}%`
}

function onTarget(n: number | null, target: number) {
  return n !== null && n >= target
}

function Metric({
  label,
  value,
  caption,
  ok,
}: {
  label: string
  value: string
  caption?: string
  ok?: boolean
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className={cn('font-mono text-3xl font-medium', ok ? 'text-status-send' : 'text-ink')}>
          {value}
        </span>
        {caption ? <span className="text-xs text-slate">{caption}</span> : null}
      </div>
    </div>
  )
}

function TierCost({ label, value, requests }: { label: string; value: number; requests: number }) {
  return (
    <div>
      <div className="text-xs text-slate">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-mono text-sm text-ink">${value.toFixed(2)}</span>
        <span className="font-mono text-xs text-slate">· {requests} req</span>
      </div>
    </div>
  )
}

function RateCells({
  rates,
  showCaption = false,
}: {
  rates: RateMetric
  showCaption?: boolean
}) {
  const reply = {
    value: pct(rates.replyRate),
    ok: onTarget(rates.replyRate, REPLY_RATE_TARGET),
    caption: `${rates.repliedLeads} replied / ${rates.sentLeads} sent`,
  }
  const check = {
    value: pct(rates.readToCheckRate),
    ok: onTarget(rates.readToCheckRate, READ_TO_CHECK_TARGET),
    caption: `${rates.checkedLeads} checks / ${rates.readLeads} reads`,
  }

  return (
    <>
      <div className="flex items-baseline gap-2">
        <span className={cn('font-mono text-lg', reply.ok ? 'text-status-send' : 'text-ink')}>
          {reply.value}
        </span>
        {showCaption ? <span className="text-xs text-slate">{reply.caption}</span> : null}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn('font-mono text-lg', check.ok ? 'text-status-send' : 'text-ink')}>
          {check.value}
        </span>
        {showCaption ? <span className="text-xs text-slate">{check.caption}</span> : null}
      </div>
    </>
  )
}

function TableHeader() {
  return (
    <div className="grid grid-cols-[1fr_8rem_8rem] items-center gap-4 border-b border-line px-5 pb-2.5 text-xs font-medium uppercase tracking-wide text-slate">
      <span>Who</span>
      <span className="text-right">Reply rate</span>
      <span className="text-right">Read to Check</span>
    </div>
  )
}

export default async function TeamPage() {
  const store = await createScoutStore()
  const [stats, extraction] = await Promise.all([
    store.getTeamStats(),
    store.getExtractionMetrics(),
  ])
  const totalRequests = Object.values(extraction.requestsByTier).reduce((sum, n) => sum + n, 0)
  const freeShare = totalRequests > 0 ? extraction.requestsByTier.tier1 / totalRequests : null

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">Team</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate">
          Two numbers, both tied to defined targets: reply rate against {pct(REPLY_RATE_TARGET)}
          and Read-to-Check against {pct(READ_TO_CHECK_TARGET)}.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-6 border-y border-line py-5 sm:grid-cols-[auto_auto_1fr] sm:gap-10">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate">Whole team</div>
          <div className="mt-1.5 space-y-1.5">
            <RateCells rates={stats.overall} showCaption />
          </div>
          <p className="mt-2 text-xs text-slate">
            target {pct(REPLY_RATE_TARGET)} reply · {pct(READ_TO_CHECK_TARGET)} check
          </p>
        </div>
        <Metric
          label="Messages sent"
          value={String(stats.overall.sent)}
          caption={`across ${stats.overall.sentLeads} leads`}
        />
        <div className="sm:text-right">
          <p className="text-xs leading-relaxed text-slate">
            Every number here is computed from real logged sends and outcomes, never an estimate.
          </p>
          <Link
            href="/team/eval"
            className="mt-1.5 inline-block text-xs font-medium text-gold underline-offset-4 hover:underline"
          >
            Open eval harness
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 border-b border-line pb-5 sm:grid-cols-3">
        <Metric
          label="Extraction failures (7d)"
          value={pct(extraction.failureRate)}
          caption={`${extraction.failures} failed / ${extraction.total} total`}
          ok={extraction.total === 0 || extraction.failureRate <= 0.08}
        />
        <Metric
          label="Extraction avg latency"
          value={`${extraction.avgLatencyMs}ms`}
          ok={extraction.avgLatencyMs > 0 && extraction.avgLatencyMs <= 4500}
        />
        <Metric
          label="Extraction p95 latency"
          value={`${Math.round(extraction.p95LatencyMs)}ms`}
          ok={extraction.p95LatencyMs > 0 && extraction.p95LatencyMs <= 8000}
        />
      </section>

      <section className="border-b border-line pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate">
            Model spend and volume, by tier (7d)
          </div>
          <span className="font-mono text-sm text-ink">${extraction.totalCostUsd.toFixed(2)}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <TierCost
            label="Tier 0 — Groq (free)"
            value={extraction.costByTier.tier1}
            requests={extraction.requestsByTier.tier1}
          />
          <TierCost
            label="Tier 1 — DeepSeek Flash"
            value={extraction.costByTier.tier2}
            requests={extraction.requestsByTier.tier2}
          />
          <TierCost
            label="Tier 2 — DeepSeek Pro"
            value={extraction.costByTier.tier3}
            requests={extraction.requestsByTier.tier3}
          />
          <TierCost
            label="Tier 4 — OpenAI"
            value={extraction.costByTier.tier4}
            requests={extraction.requestsByTier.tier4}
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate">
          {totalRequests > 0
            ? `Groq's free tier served ${pct(freeShare)} of requests this week. Tier 1+ (paid) is only reached on Groq's own daily/rate-limit overflow, or a failed confidence gate or self-check.`
            : 'No model calls logged yet this week.'}
          {' '}Cost is estimated from token counts × published per-tier rates, not a provider invoice.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-ink">Per rep</h2>
        {stats.perRep.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-line bg-paper">
            <div className="px-5 pt-4">
              <TableHeader />
            </div>
            <ul className="divide-y divide-line">
              {stats.perRep.map((row) => (
                <li key={row.rep.id}>
                  <div className="grid grid-cols-[1fr_8rem_8rem] items-center gap-4 px-5 py-4">
                    <div>
                      <div className="text-sm font-medium text-ink">{row.rep.name}</div>
                      <div className="text-xs text-slate">{row.rep.role}</div>
                    </div>
                    <RateCells rates={row} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="border-y border-dashed border-line py-6 text-center text-sm text-slate">
            No sent lines yet this quarter.
          </p>
        )}
      </section>

      {stats.perPlay.length > 0 ? (
        <section>
          <h2 className="mb-3 text-base font-medium text-ink">Per play</h2>
          <div className="overflow-hidden rounded-2xl border border-line bg-paper">
            <div className="px-5 pt-4">
              <TableHeader />
            </div>
            <ul className="divide-y divide-line">
              {stats.perPlay.map((row) => (
                <li key={row.play?.id ?? 'none'}>
                  <div className="grid grid-cols-[1fr_8rem_8rem] items-center gap-4 px-5 py-4">
                    <div>
                      <div className="text-sm font-medium text-ink">
                        {row.play?.name ?? 'No play assigned'}
                      </div>
                      <div className="text-xs text-slate">
                        {row.play?.situation ?? 'leads without a matched play'}
                      </div>
                    </div>
                    <RateCells rates={row} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  )
}
