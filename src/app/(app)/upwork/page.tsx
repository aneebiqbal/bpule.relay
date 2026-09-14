import Link from 'next/link'
import { createScoutStore } from '@/lib/store'
import { Plus, Briefcase, ArrowRight, Clock, Users } from 'lucide-react'
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
  const totalConnects = jobs.reduce((sum, j) => sum + j.connectsCost, 0)

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="reveal-up flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-widest text-slate">Job pipeline</p>
          <h1 className="text-3xl font-medium tracking-tight text-ink sm:text-4xl">Upwork</h1>
          <p className="text-sm text-slate">
            Scored on budget, competition, skill match, and urgency.
          </p>
        </div>
        <Link
          href="/upwork/new"
          className="group inline-flex items-center gap-2.5 rounded-2xl bg-orange px-5 py-3 text-sm font-medium text-bone transition-all duration-300 hover:bg-orange/90 hover:shadow-[0_8px_32px_-8px_color-mix(in_srgb,var(--orange)_40%,transparent)] active:scale-[0.98]"
        >
          <Plus className="size-4 transition-transform duration-300 group-hover:rotate-90" aria-hidden="true" />
          New job
        </Link>
      </header>

      {/* Quick stats */}
      {jobs.length > 0 && (
        <div className="reveal-up stagger-1 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-paper p-4">
            <div className="flex items-center gap-2 text-slate">
              <Briefcase className="size-3.5" />
              <span className="font-mono text-[10px] uppercase tracking-widest">Total jobs</span>
            </div>
            <p className="mt-2 font-mono text-2xl font-medium text-ink">{jobs.length}</p>
          </div>
          <div className="rounded-2xl border border-line bg-paper p-4">
            <div className="flex items-center gap-2 text-slate">
              <Users className="size-3.5" />
              <span className="font-mono text-[10px] uppercase tracking-widest">Worth applying</span>
            </div>
            <p className="mt-2 font-mono text-2xl font-medium text-status-success">{applyCount}</p>
          </div>
          <div className="rounded-2xl border border-line bg-paper p-4">
            <div className="flex items-center gap-2 text-slate">
              <Clock className="size-3.5" />
              <span className="font-mono text-[10px] uppercase tracking-widest">Connects budget</span>
            </div>
            <p className="mt-2 font-mono text-2xl font-medium text-ink">{totalConnects}</p>
          </div>
        </div>
      )}

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
