import { notFound } from 'next/navigation'
import { createScoutStore } from '@/lib/store'
import { computeUpworkScore } from '@/lib/score/upwork-rubric'
import { cn } from 'cn'

export const dynamic = 'force-dynamic'

export default async function UpworkJobPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const store = await createScoutStore()
  const job = await store.getUpworkJob(id)
  if (!job) notFound()

  const score = computeUpworkScore({
    budgetMin: job.budgetMin,
    budgetMax: job.budgetMax,
    hourlyRateMin: job.hourlyRateMin,
    hourlyRateMax: job.hourlyRateMax,
    proposalCount: job.proposalCount,
    requiredSkills: job.requiredSkills,
    urgencySignal: job.urgencySignal,
    description: job.description,
  })

  return (
    <div className="mx-auto max-w-4xl">
      <header>
        <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">{job.title}</h1>
        <p className="mt-1 text-sm text-slate">
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
      </header>

      <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-paper">
        <section className="p-6">
          <h2 className="text-base font-medium text-ink">Description</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{job.description}</p>
        </section>

        <section className="p-6">
          <h2 className="text-base font-medium text-ink">Score</h2>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="font-mono text-4xl font-medium text-ink">{score.total}</span>
            <span className="text-sm text-slate">/ 10</span>
            <span
              className={cn(
                'ml-2 rounded-full px-2.5 py-0.5 text-xs font-medium',
                score.verdict === 'apply'
                  ? 'bg-status-send/10 text-status-send'
                  : score.verdict === 'apply_if_connects'
                    ? 'bg-status-research/10 text-status-research'
                    : 'bg-line/50 text-slate',
              )}
            >
              {score.verdict.replace(/_/g, ' ')}
            </span>
          </div>
          <ul className="mt-4 space-y-2">
            {score.breakdown.map((item) => (
              <li key={item.category + item.label} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-slate">{item.label}</span>
                <span className="font-mono text-xs text-ink">{item.points}/{item.max}</span>
              </li>
            ))}
          </ul>
        </section>

        {job.urgencySignal ? (
          <section className="p-6">
            <h2 className="text-base font-medium text-ink">Urgency signal</h2>
            <p className="mt-2 text-sm text-ink">{job.urgencySignal}</p>
          </section>
        ) : null}

        {job.requiredSkills.length > 0 ? (
          <section className="p-6">
            <h2 className="text-base font-medium text-ink">Required skills</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {job.requiredSkills.map((s) => (
                <span key={s} className="rounded-md bg-paper-tint px-2 py-1 font-mono text-xs text-ink">
                  {s}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {job.messages.length > 0 ? (
          <section className="p-6">
            <h2 className="text-base font-medium text-ink">Messages</h2>
            <ul className="mt-3 divide-y divide-line">
              {job.messages.map((m) => (
                <li key={m.id} className="space-y-0.5 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-ink">{m.type}</span>
                    <span className="font-mono text-xs text-slate">
                      {m.sentAt ? `sent ${new Date(m.sentAt).toLocaleDateString()}` : `drafted ${new Date(m.createdAt).toLocaleDateString()}`}
                    </span>
                  </div>
                  {m.sentText ? (
                    <p className="text-xs leading-relaxed text-slate">{m.sentText}</p>
                  ) : m.draftText ? (
                    <p className="text-xs leading-relaxed text-slate">{m.draftText}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}
