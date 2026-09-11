import Link from 'next/link'
import { createScoutStore } from '@/lib/store'
import { Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function UpworkListPage() {
  const store = await createScoutStore()
  const jobs = await store.listUpworkJobs()

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">Upwork jobs</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate">
            Jobs scored on the Upwork rubric: budget, competition, skill match, and urgency.
          </p>
        </div>
        <Link
          href="/upwork/new"
          className="inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-gold/90"
        >
          <Plus className="size-4" aria-hidden="true" />
          New job
        </Link>
      </header>

      {jobs.length === 0 ? (
        <div className="space-y-4 rounded-2xl border border-line bg-paper p-8 text-center">
          <div>
            <p className="text-sm font-medium text-ink">No Upwork jobs yet.</p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate">
              Paste a job post and Relay scores it so you know whether it is worth the Connects.
            </p>
          </div>
          <Link
            href="/upwork/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-gold/90"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add the first job
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-paper">
          <ul className="divide-y divide-line">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/upwork/${job.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-paper-tint/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{job.title}</p>
                    <p className="mt-0.5 text-xs text-slate">
                      {job.budgetMin && job.budgetMax
                        ? `$${job.budgetMin}-$${job.budgetMax} fixed`
                        : job.hourlyRateMin && job.hourlyRateMax
                          ? `$${job.hourlyRateMin}-$${job.hourlyRateMax}/hr`
                          : 'Budget not stated'}
                      {' · '}
                      {job.proposalCount !== null ? `${job.proposalCount} proposals` : 'proposals unknown'}
                      {' · '}
                      {job.connectsCost} Connects
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        job.verdict === 'apply'
                          ? 'bg-status-send/10 text-status-send'
                          : job.verdict === 'apply_if_connects'
                            ? 'bg-status-research/10 text-status-research'
                            : 'bg-line/50 text-slate'
                      }`}
                    >
                      {job.score ?? '-'} / 10
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
