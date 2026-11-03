import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { InlineError, Section } from '@/components/operations/ops-primitives'
import { getPeopleDirectory, requireTeamContext } from '@/lib/operations/page-context'
import { buildWorkloadRows, workloadScale } from '@/lib/team/workload'

export const dynamic = 'force-dynamic'

/**
 * Team → Workload. A per-person comparison of open work. Workload is context
 * for intervention, never a performance verdict — overdue work and reply age
 * are surfaced separately so a busy rep is not mistaken for a struggling one.
 */
export default async function TeamWorkloadPage() {
  const ctx = await requireTeamContext()
  const directory = await getPeopleDirectory().catch(() => null)
  const rows = directory?.rows ?? []
  const workload = buildWorkloadRows(rows)
  const scale = workloadScale(workload)

  const total = workload.reduce((s, r) => s + r.open, 0)
  const overdue = workload.reduce((s, r) => s + r.overdueTasks, 0)
  const replies = workload.reduce((s, r) => s + r.replies, 0)
  const followUps = workload.reduce((s, r) => s + r.followUps, 0)
  const sorted = [...workload].map((r) => r.open).sort((a, b) => a - b)
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
  const max = workload[0]?.open ?? 0
  const imbalance = median > 0 && max > median * 2

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Team"
        title="Workload"
        description="Open work per person. Use it to rebalance, not to rank."
      />

      {!directory ? (
        <InlineError>The team could not be loaded. Refresh to try again.</InlineError>
      ) : workload.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[13px] text-graphite">
          No one in scope.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Open work', value: total },
              { label: 'Replies waiting', value: replies, warn: replies > 0 },
              { label: 'Overdue tasks', value: overdue, warn: overdue > 0 },
              { label: 'Follow-ups due', value: followUps },
            ].map((m) => (
              <div key={m.label} className="rounded-lg border border-line bg-bone-raised px-3 py-2.5">
                <p className="text-[11px] text-graphite">{m.label}</p>
                <p className={`mt-0.5 text-[20px] font-medium tabular-nums ${m.warn ? 'text-orange' : 'text-ink'}`}>
                  {m.value}
                </p>
              </div>
            ))}
          </div>

          {imbalance && (
            <p className="rounded-lg border border-status-warning/30 bg-status-warning/5 px-3 py-2 text-[13px] text-graphite">
              Capacity imbalance: {workload[0]?.repName} is carrying more than twice the median open work.
            </p>
          )}

          <Section title="Open work per person" description="Pipeline + replies + follow-ups + overdue tasks.">
            <ul className="divide-y divide-line/70 overflow-hidden rounded-lg border border-line">
              {workload.map((w) => (
                <li key={w.repId} className="px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/team/${w.repId}`} className="truncate text-[13px] font-medium text-ink hover:underline">
                      {w.repName}
                    </Link>
                    <span className="shrink-0 text-[12px] tabular-nums text-graphite">
                      <span className="font-medium text-ink">{w.open}</span> open
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bone" aria-hidden>
                    <div className="h-1.5 rounded-full bg-orange/70" style={{ width: `${Math.round((w.open / scale) * 100)}%` }} />
                  </div>
                  <dl className="mt-1.5 grid grid-cols-4 gap-2 text-[11px]">
                    <div><dt className="text-stone">Replies</dt><dd className="tabular-nums text-ink">{w.replies}</dd></div>
                    <div><dt className="text-stone">Overdue</dt><dd className={`tabular-nums ${w.overdueTasks ? 'font-medium text-status-danger' : 'text-ink'}`}>{w.overdueTasks}</dd></div>
                    <div><dt className="text-stone">Follow-ups</dt><dd className="tabular-nums text-ink">{w.followUps}</dd></div>
                    <div><dt className="text-stone">Leads</dt><dd className="tabular-nums text-ink">{w.openLeads}</dd></div>
                  </dl>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  )
}
