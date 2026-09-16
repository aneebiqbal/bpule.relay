import Link from 'next/link'
import { createScoutStore } from '@/lib/store'
import { Plus, Briefcase, ArrowRight, Clock, Users, CheckCircle2 } from 'lucide-react'
import { cn } from 'cn'


export const dynamic = 'force-dynamic'

const VERDICT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  apply: { bg: 'bg-status-success/10', text: 'text-status-success', label: 'Apply' },
  apply_if_connects: { bg: 'bg-status-warning/10', text: 'text-status-warning', label: 'If Connects' },
  skip: { bg: 'bg-bone', text: 'text-slate', label: 'Skip' },
}

export default async function UpworkListPage() {
  const store = await createScoutStore()
  const jobs = await store.listUpworkJobs()

  const applyCount = jobs.filter((j) => j.verdict === 'apply').length
  const ifConnectsCount = jobs.filter((j) => j.verdict === 'apply_if_connects').length
  const totalConnects = jobs.reduce((sum, j) => sum + j.connectsCost, 0)

  return (
    <div className="space-y-5">
      <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-2">
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Opportunity / Upwork Lanes</p>
            <h1 className="text-[30px] font-medium leading-[1.05] tracking-[-0.03em] text-[color:var(--console-text)]">Spend Connects where win probability is real.</h1>
            <p className="max-w-2xl text-[13px] text-[color:var(--console-mute)]">
              Relay scores each job by fit, competition, and urgency so reps focus on high-return applications.
            </p>
          </div>
          <Link
            href="/upwork/new"
            className="group inline-flex items-center gap-2.5 rounded-md bg-orange px-4 py-2 text-sm font-medium text-bone transition-all hover:bg-orange/90"
          >
            <Plus className="size-4 transition-transform duration-300 group-hover:rotate-90" aria-hidden="true" />
            New job
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <ConsoleMetric icon={<Briefcase className="size-3.5" />} label="Total jobs" value={jobs.length} />
          <ConsoleMetric icon={<CheckCircle2 className="size-3.5" />} label="Apply now" value={applyCount} />
          <ConsoleMetric icon={<Users className="size-3.5" />} label="Apply if connects" value={ifConnectsCount} />
          <ConsoleMetric icon={<Clock className="size-3.5" />} label="Connects at stake" value={totalConnects} />
        </div>
      </section>

      {/* Job list */}
      {jobs.length === 0 ? (
        <section className="reveal-up stagger-2 rounded-3xl border border-dashed border-line bg-paper/50 p-12 text-center">
          <div className="mx-auto max-w-sm space-y-4">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-bone">
              <Briefcase className="size-5 text-orange" aria-hidden="true" />
            </div>
            <div>
              <p className="text-base font-medium text-ink">No Upwork jobs yet.</p>
              <p className="mt-2 text-sm leading-relaxed text-slate">
                Paste a job post and Relay scores it so you know whether it&apos;s worth the Connects.
              </p>
            </div>
            <Link
              href="/upwork/new"
              className="inline-flex items-center gap-2 rounded-2xl bg-orange px-5 py-2.5 text-sm font-medium text-bone transition-all duration-300 hover:bg-orange/90"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add the first job
            </Link>
          </div>
        </section>
      ) : (
        <div className="reveal-up stagger-2 overflow-hidden rounded-2xl border border-line bg-paper">
          <ul className="divide-y divide-line">
            {jobs.map((job, i) => {
              const verdict = job.verdict ? VERDICT_STYLE[job.verdict] : VERDICT_STYLE.skip
              return (
                <li
                  key={job.id}
                  className="slide-in-right"
                  style={{ animationDelay: `${0.03 + i * 0.03}s` }}
                >
                  <Link
                    href={`/upwork/${job.id}`}
                    className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-bone/40"
                  >
                    {/* Score */}
                    <div
                      className={cn(
                        'flex size-11 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-medium',
                        verdict.bg,
                        verdict.text,
                      )}
                    >
                      {job.score ?? '—'}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink transition-colors group-hover:text-orange">
                          {job.title}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate">
                        <span>
                          {job.budgetMin && job.budgetMax
                            ? `$${job.budgetMin}–$${job.budgetMax}`
                            : job.hourlyRateMin && job.hourlyRateMax
                              ? `$${job.hourlyRateMin}–$${job.hourlyRateMax}/hr`
                              : 'Budget not stated'}
                        </span>
                        <span className="text-line">·</span>
                        <span>{job.proposalCount !== null ? `${job.proposalCount} proposals` : 'unknown'}</span>
                        <span className="text-line">·</span>
                        <span>{job.connectsCost} Connects</span>
                      </div>
                    </div>

                    {/* Verdict + arrow */}
                    <span
                      className={cn(
                        'hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex',
                        verdict.bg,
                        verdict.text,
                      )}
                    >
                      {verdict.label}
                    </span>
                    <ArrowRight
                      className="size-4 shrink-0 text-line transition-all duration-200 group-hover:text-orange group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function ConsoleMetric({
  label,
  value,
  icon,
}: {
  label: string
  value: number
  icon: React.ReactNode
}) {
  return (
    <div className="rounded border border-orange/20 bg-orange/5 px-3 py-2">
      <div className="flex items-center gap-1.5 text-orange-light/80">
        {icon}
        <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em]">{label}</p>
      </div>
      <p className="mt-1 text-[20px] font-medium text-[color:var(--console-text)]">{value}</p>
    </div>
  )
}
