import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { can, getAuthContext } from '@/lib/auth/organization'
import { loadTeamLive } from '@/lib/admin/load-team-live'
import { filterTeamLive, type TeamLivePayload } from '@/lib/admin/team-live'
import { REPLY_RATE_TARGET, READ_TO_CHECK_TARGET } from '@/lib/ai/config'
import { TeamLiveBoard } from '@/components/admin/team-live-board'
import {
  TrendingUp,
  Users,
  Clock,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Award,
  Target,
  Gauge,
  Cpu,
} from 'lucide-react'
import { cn } from 'cn'

export const dynamic = 'force-dynamic'

function pct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n * 100)}%`
}

function onTarget(n: number | null, target: number) {
  return n !== null && n >= target
}

function trendIcon(rate: number | null, target: number) {
  if (rate === null) return <Minus className="size-3 text-graphite" />
  if (rate >= target) return <ArrowUpRight className="size-3 text-status-success" />
  return <ArrowDownRight className="size-3 text-status-warning" />
}

export default async function TeamPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const authCtx = await getAuthContext()
  const canSeeTeam = Boolean(authCtx && can(authCtx, 'VIEW_TEAM_ANALYTICS'))

  const livePromise: Promise<TeamLivePayload | null> = authCtx
    ? loadTeamLive(authCtx.orgId)
        .then((full) => filterTeamLive(full, { repId: authCtx.repId, canSeeTeam }))
        .catch(() => null)
    : Promise.resolve(null)

  const store = await createScoutStore()
  const [statsRes, extractionRes, live] = await Promise.all([
    store.getTeamStats().then((value) => ({ status: 'fulfilled' as const, value })).catch(() => ({ status: 'rejected' as const })),
    store.getExtractionMetrics().then((value) => ({ status: 'fulfilled' as const, value })).catch(() => ({ status: 'rejected' as const })),
    livePromise,
  ])
  const stats =
    statsRes.status === 'fulfilled'
      ? statsRes.value
      : {
          overall: { sent: 0, sentLeads: 0, repliedLeads: 0, replyRate: null, readLeads: 0, checkedLeads: 0, readToCheckRate: null },
          perRep: [],
          perPlay: [],
        }
  const extraction =
    extractionRes.status === 'fulfilled'
      ? extractionRes.value
      : {
          total: 0, failures: 0, failureRate: 0, avgLatencyMs: 0, p95LatencyMs: 0,
          costByTier: { tier1: 0, tier2: 0, tier3: 0, tier4: 0 },
          totalCostUsd: 0,
          requestsByTier: { tier1: 0, tier2: 0, tier3: 0, tier4: 0 },
        }

  const totalRequests = Object.values(extraction.requestsByTier).reduce((sum, n) => sum + n, 0)
  const freeShare = totalRequests > 0 ? extraction.requestsByTier.tier1 / totalRequests : null

  return (
    <div className="space-y-5">

      <header className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Team</p>
        <h1 className="mt-2 text-[30px] leading-[1.05] tracking-[-0.03em] text-[color:var(--console-text)]">
          {canSeeTeam ? 'What each person is working on.' : 'What you are working on.'}
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] text-[color:var(--console-mute)]">
          Identity, today&apos;s goals, the open leads in the queue, and what moved since this morning. Open a person for the full day.
        </p>
      </header>

      <section>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl border border-line bg-bone-raised" />}>
          <TeamLiveBoard initial={live} />
        </Suspense>
      </section>

      {/* ═══ PRIMARY METRICS ═══ */}
      <div className="reveal-up stagger-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<Activity className="size-4" />}
          label="Reply rate"
          value={pct(stats.overall.replyRate)}
          target={`target ${pct(REPLY_RATE_TARGET)}`}
          ok={onTarget(stats.overall.replyRate, REPLY_RATE_TARGET)}
          sub={`${stats.overall.repliedLeads} of ${stats.overall.sentLeads} replied`}
          trend={trendIcon(stats.overall.replyRate, REPLY_RATE_TARGET)}
        />
        <MetricCard
          icon={<Target className="size-4" />}
          label="Read to Check"
          value={pct(stats.overall.readToCheckRate)}
          target={`target ${pct(READ_TO_CHECK_TARGET)}`}
          ok={onTarget(stats.overall.readToCheckRate, READ_TO_CHECK_TARGET)}
          sub={`${stats.overall.checkedLeads} of ${stats.overall.readLeads} checked`}
          trend={trendIcon(stats.overall.readToCheckRate, READ_TO_CHECK_TARGET)}
        />
        <MetricCard
          icon={<Users className="size-4" />}
          label="Messages sent"
          value={String(stats.overall.sent)}
          sub={`across ${stats.overall.sentLeads} leads`}
        />
        <MetricCard
          icon={<Gauge className="size-4" />}
          label="Extraction health"
          value={pct(extraction.failureRate)}
          sub={`${extraction.failures} failed / ${extraction.total} total`}
          ok={extraction.total === 0 || extraction.failureRate <= 0.08}
          invert
        />
      </div>

      <details className="reveal-up stagger-2 rounded-2xl border border-line/60 bg-bone-raised px-5 py-4">
        <summary className="cursor-pointer text-label text-graphite">System health · latency and model mix</summary>
        <div className="mt-4 grid gap-3 lg:grid-cols-5">
        {/* Latency — 2 cols */}
        <div className="lg:col-span-2 rounded-2xl border border-line/60 bg-bone-raised p-5">
          <div className="flex items-center gap-2 text-graphite">
            <Clock className="size-3.5" />
            <span className="text-label">Extraction latency</span>
          </div>
          <div className="mt-4 flex items-baseline gap-5">
            <div>
              <span className="text-mono-medium text-2xl font-medium text-ink">{extraction.avgLatencyMs}<span className="text-sm font-normal text-graphite">ms</span></span>
              <p className="text-xs text-graphite">average</p>
            </div>
            <div>
              <span className="text-mono-medium text-2xl font-medium text-ink">{Math.round(extraction.p95LatencyMs)}<span className="text-sm font-normal text-graphite">ms</span></span>
              <p className="text-xs text-graphite">p95</p>
            </div>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-bone">
            <div
              className={cn('h-full rounded-full transition-all duration-500',
                extraction.avgLatencyMs > 0 && extraction.avgLatencyMs <= 4500 ? 'bg-status-success' : 'bg-status-warning')}
              style={{ width: `${Math.min(100, (extraction.avgLatencyMs / 8000) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-graphite">
            {extraction.avgLatencyMs > 0 && extraction.avgLatencyMs <= 4500
              ? 'Within target range.'
              : 'Above 4.5s target — investigate if sustained.'}
          </p>
        </div>

        {/* Model mix — 3 cols */}
        <div className="lg:col-span-3 rounded-2xl border border-line/60 bg-bone-raised p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-graphite">
              <Cpu className="size-3.5" />
              <span className="text-label">Model mix (7d)</span>
            </div>
            <span className="text-mono-medium text-lg font-medium text-ink">${extraction.totalCostUsd.toFixed(2)}</span>
          </div>

          {/* Visual bar */}
          {totalRequests > 0 && (
            <div className="mt-4 flex h-3 overflow-hidden rounded-full">
              {([
                { tier: 'tier1', color: 'bg-status-success', pct: extraction.requestsByTier.tier1 / totalRequests },
                { tier: 'tier2', color: 'bg-orange', pct: extraction.requestsByTier.tier2 / totalRequests },
                { tier: 'tier3', color: 'bg-status-warning', pct: extraction.requestsByTier.tier3 / totalRequests },
                { tier: 'tier4', color: 'bg-ink/60', pct: extraction.requestsByTier.tier4 / totalRequests },
              ] as const)
                .filter((t) => t.pct > 0)
                .map((t) => (
                  <div key={t.tier} className={cn('h-full transition-all', t.color)} style={{ width: `${t.pct * 100}%` }} />
                ))}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([
              { label: 'Groq (free)', cost: extraction.costByTier.tier1, req: extraction.requestsByTier.tier1, color: 'bg-status-success' },
              { label: 'DeepSeek Flash', cost: extraction.costByTier.tier2, req: extraction.requestsByTier.tier2, color: 'bg-orange' },
              { label: 'DeepSeek Pro', cost: extraction.costByTier.tier3, req: extraction.requestsByTier.tier3, color: 'bg-status-warning' },
              { label: 'OpenAI', cost: extraction.costByTier.tier4, req: extraction.requestsByTier.tier4, color: 'bg-ink/40' },
            ] as const).map((tier) => (
              <div key={tier.label} className="rounded-lg bg-bone/40 px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn('size-2 rounded-full', tier.color)} />
                  <span className="text-[10px] text-graphite">{tier.label}</span>
                </div>
                <p className="mt-0.5 text-mono-medium text-sm text-ink">${tier.cost.toFixed(2)}</p>
                <p className="text-mono-medium text-[10px] text-graphite">{tier.req} req</p>
              </div>
            ))}
          </div>

          {totalRequests > 0 && (
            <p className="mt-3 text-xs text-graphite">
              Groq&apos;s free tier served <span className="font-medium text-ink">{pct(freeShare)}</span> of requests.
            </p>
          )}
        </div>
        </div>
      </details>

      {/* ═══ PER REP ═══ */}
      <section className="reveal-up stagger-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-label">Reply quality</h2>
          <Link href="/team/eval" className="inline-flex items-center gap-1.5 text-xs font-medium text-orange transition-colors hover:text-orange/80">
            Eval harness
            <TrendingUp className="size-3" />
          </Link>
        </div>
        {stats.perRep.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-line/60 bg-bone-raised">
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-line/40 bg-bone/30 px-5 py-2.5 text-label">
              <span>Who</span>
              <span className="w-16 text-right">Reply</span>
              <span className="w-16 text-right">R→C</span>
              <span className="w-16 text-right">Sent</span>
            </div>
            <ul className="divide-y divide-line/40">
              {stats.perRep.map((row, i) => (
                <li key={row.rep.id}
                  className="slide-in-right grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-bone/20"
                  style={{ animationDelay: `${0.04 + i * 0.03}s` }}>
                  <div>
                    <Link href={`/team/${row.rep.id}`} className="text-sm font-medium text-ink hover:underline">{row.rep.name}</Link>
                    <div className="text-xs text-graphite">{row.rep.role}</div>
                  </div>
                  <RateCell rate={row.replyRate} target={REPLY_RATE_TARGET} className="w-16" />
                  <RateCell rate={row.readToCheckRate} target={READ_TO_CHECK_TARGET} className="w-16" />
                  <span className="w-16 text-right text-mono-medium text-sm text-ink">{row.sent}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line py-8 text-center">
            <p className="text-sm text-graphite">No sent lines yet this quarter.</p>
          </div>
        )}
      </section>

      {/* ═══ PER PLAY ═══ */}
      {stats.perPlay.length > 0 && (
        <section className="reveal-up stagger-4 space-y-3">
          <h2 className="text-label">Per play</h2>
          <div className="overflow-hidden rounded-2xl border border-line/60 bg-bone-raised">
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-line/40 bg-bone/30 px-5 py-2.5 text-label">
              <span>Play</span>
              <span className="w-16 text-right">Reply</span>
              <span className="w-16 text-right">R→C</span>
              <span className="w-16 text-right">Sent</span>
            </div>
            <ul className="divide-y divide-line/40">
              {stats.perPlay.map((row, i) => (
                <li key={row.play?.id ?? 'none'}
                  className="slide-in-right grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-bone/20"
                  style={{ animationDelay: `${0.04 + i * 0.03}s` }}>
                  <div>
                    <div className="text-sm font-medium text-ink">{row.play?.name ?? 'No play'}</div>
                    <div className="text-xs text-graphite">{row.play?.situation ?? 'unmatched leads'}</div>
                  </div>
                  <RateCell rate={row.replyRate} target={REPLY_RATE_TARGET} className="w-16" />
                  <RateCell rate={row.readToCheckRate} target={READ_TO_CHECK_TARGET} className="w-16" />
                  <span className="w-16 text-right text-mono-medium text-sm text-ink">{row.sent}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ═══ TARGET REFERENCE ═══ */}
      <div className="reveal-up stagger-4 srf-proof flex flex-wrap items-center gap-4 px-4 py-3 text-xs text-graphite">
        <span className="flex items-center gap-1.5"><Award className="size-3 text-orange" /> Targets</span>
        <span>Reply rate &ge; {pct(REPLY_RATE_TARGET)}</span>
        <span className="text-line">·</span>
        <span>Read-to-Check &ge; {pct(READ_TO_CHECK_TARGET)}</span>
        <span className="text-line">·</span>
        <span>Extraction p95 &lt; 8000ms</span>
        <span className="text-line">·</span>
        <span>Failure rate &le; 8%</span>
      </div>
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
  trend,
}: {
  icon: React.ReactNode
  label: string
  value: string
  target?: string
  sub?: string
  ok?: boolean
  invert?: boolean
  trend?: React.ReactNode
}) {
  const color = invert
    ? ok ? 'text-status-success' : 'text-status-warning'
    : ok !== undefined ? (ok ? 'text-status-success' : 'text-status-danger') : 'text-ink'

  return (
    <div className="rounded-2xl border border-line/60 bg-bone-raised p-4 transition-all duration-300 hover:shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-graphite">
          {icon}
          <span className="text-label">{label}</span>
        </div>
        {trend}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={cn('text-mono-medium text-2xl font-medium tracking-tight', color)}>{value}</span>
        {target && <span className="text-[10px] text-graphite">{target}</span>}
      </div>
      {sub && <p className="mt-0.5 text-xs text-graphite">{sub}</p>}
    </div>
  )
}

function RateCell({
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
    <div className={cn('flex items-center gap-1', className)}>
      <span className={cn('text-mono-medium text-sm', ok ? 'text-status-success' : 'text-ink')}>
        {pct(rate)}
      </span>
      {ok ? <Award className="size-3 text-status-success" /> : null}
    </div>
  )
}
