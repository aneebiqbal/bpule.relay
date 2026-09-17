import Link from 'next/link'
import { Suspense } from 'react'
import { ArrowRight, CheckCircle2, Clock3, ShieldCheck } from 'lucide-react'
import { cn } from 'cn'
import {
  formatBenchmarkTimestamp,
  getIntelligenceBenchmarkSnapshot,
  type BenchmarkTimelineEvent,
  type IntelligenceBenchmarkSnapshot,
} from '@/lib/intelligence-v2/benchmark-data'

export const dynamic = 'force-dynamic'

async function loadBenchmarkSnapshot() {
  return getIntelligenceBenchmarkSnapshot()
}

export default function RelayBenchmarkPage() {
  const snapshotPromise = loadBenchmarkSnapshot()

  return (
    <Suspense fallback={<BenchmarkContentSkeleton />}>
      <BenchmarkContent snapshotPromise={snapshotPromise} />
    </Suspense>
  )
}

async function BenchmarkContent({
  snapshotPromise,
}: {
  snapshotPromise: Promise<IntelligenceBenchmarkSnapshot | null>
}) {
  const snapshot = await snapshotPromise

  if (!snapshot || snapshot.metrics.app.length === 0) {
    return <BenchmarkEmptyState />
  }

  const appCopy = snapshot.copy.app
  const verified = formatBenchmarkTimestamp(snapshot.lastVerifiedAt)
  const completedEvents = snapshot.timelineEvents.filter((event) => event.state === 'complete' || event.state === 'resolved').length
  const progress = snapshot.timelineEvents.length > 0
    ? Math.round((completedEvents / snapshot.timelineEvents.length) * 100)
    : 0

  return (
    <div className="space-y-5">
      <header className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Relay / Proof Lab</p>
        <h1 className="mt-2 text-[30px] leading-[1.05] tracking-[-0.03em] text-[color:var(--console-text)]">
          {appCopy.header}
        </h1>
        <p className="mt-2 max-w-3xl text-[13px] text-[color:var(--console-mute)]">
          {appCopy.description}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded border border-orange/30 bg-orange/10 px-2 py-1 text-orange-light">
            <Clock3 className="size-3" />
            Last verified: {verified}
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-[var(--console-line)] px-2 py-1 text-[color:var(--console-mute)]">
            Dataset {snapshot.artifact.datasetVersion}
          </span>
        </div>
      </header>

      <section className="rounded border border-status-success/35 bg-status-success/8 px-4 py-3 sm:px-5">
        <p className="inline-flex items-center gap-2 text-[13px] font-medium text-status-success">
          <CheckCircle2 className="size-4" />
          {appCopy.statusBanner}
        </p>
        <p className="mt-1 text-[12px] text-graphite">{snapshot.status.detail}</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {snapshot.metrics.app.map((metric) => (
          <article key={metric.id} className="rounded border border-line bg-bone-raised px-4 py-3">
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">{metric.label}</p>
            <p className="mt-1 text-[24px] font-medium tracking-[-0.02em] text-ink">{metric.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded border border-line bg-bone-raised px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-medium text-ink">{appCopy.timelineTitle}</h2>
          <span className="inline-flex items-center gap-1 rounded border border-orange/30 bg-orange/10 px-2 py-1 text-mono-medium text-[10px] uppercase tracking-[0.13em] text-orange">
            {progress}% complete
          </span>
        </div>

        <div className="mt-3 h-1.5 rounded bg-line/70">
          <div className="h-full rounded bg-orange transition-all" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>

        <ol className="mt-4 space-y-2.5">
          {snapshot.timelineEvents.map((event) => (
            <TimelineRow key={event.id} event={event} />
          ))}
        </ol>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded border border-line bg-bone-raised px-4 py-4 sm:px-5">
          <h2 className="text-[16px] font-medium text-ink">{appCopy.evidenceTitle}</h2>
          <div className="mt-3 overflow-hidden rounded border border-line/80 bg-bone">
            {snapshot.evidence.map((row) => (
              <div key={row.key} className="grid grid-cols-[10.4rem_1fr] items-start gap-3 border-b border-line/70 px-3 py-2.5 last:border-b-0 max-sm:grid-cols-1">
                <p className="text-mono-medium text-[10px] uppercase tracking-[0.13em] text-stone">{row.key}</p>
                <p className="break-all font-mono text-[12px] text-ink">{row.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded border border-line bg-bone-raised px-4 py-4 sm:px-5">
            <h2 className="text-[16px] font-medium text-ink">{appCopy.categoriesTitle}</h2>
            <div className="mt-3 grid gap-2">
              {snapshot.categoryResults.map((category) => (
                <article key={category.id} className="rounded border border-line/80 bg-bone px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-medium text-ink">{category.label}</p>
                    <span className="text-mono-medium text-[11px] text-orange">{category.passed}/{category.total}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-graphite">{category.notes}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded border border-orange/35 bg-orange/8 px-4 py-4 sm:px-5">
            <p className="text-[13px] leading-relaxed text-ink">{appCopy.warmExplanation}</p>
          </section>
        </div>
      </section>

      <section className="rounded border border-line bg-bone-raised px-4 py-4 sm:px-5">
        <h2 className="text-[16px] font-medium text-ink">{appCopy.whatThisMeansTitle}</h2>
        <div className="mt-3 space-y-2">
          {appCopy.whatThisMeans.map((point) => (
            <p key={point} className="flex items-start gap-2 text-[13px] leading-relaxed text-graphite">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-cobalt" />
              <span>{point}</span>
            </p>
          ))}
        </div>
      </section>

      <section className="rounded border border-line bg-bone px-4 py-4 sm:px-5">
        <p className="text-[12px] text-graphite">{appCopy.qualityGateNote}</p>
        <p className="mt-2 text-[14px] font-medium text-ink">{appCopy.finalCta}</p>
        <div className="mt-3">
          <Link
            href="/relay"
            className="inline-flex items-center gap-2 rounded border border-line bg-bone-raised px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone"
          >
            <ArrowRight className="size-3.5 rotate-180" />
            Back to Relay queue
          </Link>
        </div>
      </section>
    </div>
  )
}

function TimelineRow({ event }: { event: BenchmarkTimelineEvent }) {
  const done = event.state === 'complete' || event.state === 'resolved'

  return (
    <li className="rounded border border-line/80 bg-bone px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded px-1.5 py-0.5 text-mono-medium text-[9px] uppercase tracking-[0.11em]',
            done ? 'bg-status-success/12 text-status-success' : 'bg-status-warning/12 text-status-warning',
          )}
        >
          {done ? 'Done' : 'In review'}
        </span>
        <p className="text-[13px] font-medium text-ink">{event.label}</p>
      </div>
      <p className="mt-1 text-[12px] text-graphite">{event.detail}</p>
    </li>
  )
}

function BenchmarkEmptyState() {
  return (
    <section className="rounded border border-dashed border-line bg-bone-raised px-5 py-12 text-center">
      <p className="text-[16px] font-medium text-ink">No benchmark snapshot loaded yet.</p>
      <p className="mx-auto mt-2 max-w-xl text-[13px] text-graphite">
        Publish a benchmark result artifact to restore this screen and verify the latest Relay Intelligence gate.
      </p>
      <Link
        href="/relay"
        className="mt-5 inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone"
      >
        <ArrowRight className="size-3.5 rotate-180" />
        Back to Relay queue
      </Link>
    </section>
  )
}

function BenchmarkContentSkeleton() {
  return (
    <div className="space-y-5">
      <div className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <div className="h-3 w-36 rounded bg-bone/20" />
        <div className="mt-3 h-8 w-80 max-w-full rounded bg-bone/20" />
        <div className="mt-2 h-3.5 w-[32rem] max-w-full rounded bg-bone/20" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded border border-line bg-bone-raised px-4 py-3">
            <div className="h-2.5 w-24 rounded bg-bone" />
            <div className="mt-2 h-6 w-20 rounded bg-bone" />
          </div>
        ))}
      </div>

      <div className="rounded border border-line bg-bone-raised px-4 py-4 sm:px-5">
        <div className="h-4 w-40 rounded bg-bone" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="rounded border border-line/80 bg-bone px-3 py-3">
              <div className="h-3 w-56 rounded bg-bone-raised" />
              <div className="mt-2 h-3 w-full rounded bg-bone-raised" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
