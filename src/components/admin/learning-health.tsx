import { first100Progress, learningHealth, reviewerAgreement, type LearningHealth } from '@/lib/admin/learning-health'

/**
 * First-100 campaign header + learning health summary.
 *
 * Every number comes from the canonical label/evaluation tables. A zero is a
 * true zero; nothing here fakes progress.
 */
export async function LearningHealthHeader({ orgId }: { orgId: string }) {
  const { createServerSupabase } = await import('@/lib/supabase/server')
  const client = await createServerSupabase()
  const [health, agreement] = await Promise.all([
    learningHealth(client, orgId),
    reviewerAgreement(client, orgId),
  ])

  return (
    <div className="space-y-4" aria-label="First-100 campaign progress">
      <div className="rounded-lg border border-line bg-bone-raised p-5">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">First 100 real opportunities</p>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric label="Opportunity labels" value={`${health.opportunityLabels} / ${health.target}`} />
          <Metric label="Pairwise judgments" value={String(health.pairwise)} />
          <Metric label="Routing reviews" value={String(health.routingReviews)} />
          <Metric label="Message reviews" value={String(health.messageReviews)} />
          <Metric label="Thesis reviews" value={String(health.thesisReviews)} />
        </div>
        <p className="mt-3 text-[11px] text-graphite">{health.remaining} remaining in the first-100 pool.</p>
      </div>

      <div className="rounded-lg border border-line bg-bone-raised p-5">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Learning health</p>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Message pass rate" value={health.messagePassRate != null ? `${health.messagePassRate}%` : '—'} />
          <Metric label="Thesis misleading" value={health.thesisMisleadingRate != null ? `${health.thesisMisleadingRate}%` : '—'} />
          <Metric label="V1 routing accuracy" value={health.routingAgreement.v1 != null ? `${health.routingAgreement.v1}%` : '—'} />
          <Metric label="V2 routing accuracy" value={health.routingAgreement.v2 != null ? `${health.routingAgreement.v2}%` : '—'} />
        </div>
        {agreement != null && <p className="mt-2 text-[11px] text-graphite">Reviewer agreement: {agreement}%</p>}
        <LabelDistribution distribution={health.labelDistribution} />
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-stone">{label}</p>
      <p className="mt-0.5 text-[18px] font-medium tabular-nums text-ink">{value}</p>
    </div>
  )
}

function LabelDistribution({ distribution }: { distribution: Record<string, number> }) {
  const entries = Object.entries(distribution)
  if (entries.length === 0) return <p className="mt-2 text-[11px] text-stone">No labels yet.</p>
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span key={k} className="rounded-full bg-bone px-2 py-0.5 text-[10px] font-medium text-graphite">
          {k.toLowerCase()} · {v}
        </span>
      ))}
    </div>
  )
}

export type { LearningHealth }
export { first100Progress }
