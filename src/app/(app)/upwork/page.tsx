import Link from 'next/link'
import { Plus, ChevronRight } from 'lucide-react'
import { createScoutStore } from '@/lib/store'
import { V4PageHeader, V4Panel, V4PanelHeader, V4Chip, V4Empty } from '@/components/v4/primitives'
import { ConnectsPanel } from '@/components/upwork-connects-panel'
import { upworkStageLabel } from '@/lib/upwork/pipeline'

export const dynamic = 'force-dynamic'

const VERDICT_CHIP: Record<string, { tone: 'success' | 'warning' | 'neutral'; label: string }> = {
  apply: { tone: 'success', label: 'Apply' },
  apply_if_connects: { tone: 'warning', label: 'If Connects' },
  skip: { tone: 'neutral', label: 'Skip' },
}

function payLine(job: { budgetMin: number | null; budgetMax: number | null; hourlyRateMin: number | null; hourlyRateMax: number | null }): string | null {
  if (job.hourlyRateMin && job.hourlyRateMax) {
    return job.hourlyRateMin === job.hourlyRateMax ? `$${job.hourlyRateMin}/hr` : `$${job.hourlyRateMin}–$${job.hourlyRateMax}/hr`
  }
  if (job.budgetMin && job.budgetMax) {
    return job.budgetMin === job.budgetMax ? `$${job.budgetMin.toLocaleString()} fixed` : `$${job.budgetMin.toLocaleString()}–$${job.budgetMax.toLocaleString()} fixed`
  }
  if (job.budgetMin) return `$${job.budgetMin.toLocaleString()} fixed`
  if (job.budgetMax) return `Up to $${job.budgetMax.toLocaleString()}`
  return null
}

export default async function UpworkPage() {
  const store = await createScoutStore()
  const jobs = await store.listUpworkJobs()
  const open = jobs.filter((j) => j.status !== 'awarded' && j.status !== 'rejected' && j.status !== 'dead' && j.status !== 'no')
  const scored = jobs.filter((j) => j.score != null)

  return (
    <div className="space-y-6">
      <V4PageHeader
        eyebrow="Sales / Upwork"
        title="Upwork"
        subtitle="Extract jobs, generate proposals, apply — all in one flow."
        actions={
          <Link
            href="/upwork/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3.5 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
          >
            <Plus className="size-4" aria-hidden />
            Extract job
          </Link>
        }
      />

      <ConnectsPanel />

      <V4Panel>
        <V4PanelHeader
          eyebrow="Pipeline"
          title="Jobs"
          hint={`${open.length} open · ${scored.length} scored`}
          action={
            <Link href="/upwork/new" className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite hover:text-ink">
              New job <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          }
        />
        {jobs.length === 0 ? (
          <div className="mt-4">
            <V4Empty
              title="No Upwork jobs yet"
              body="Paste a Upwork job URL or text. Relay extracts the details, scores fit, and helps you write a proposal."
            >
              <Link href="/upwork/new" className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid">
                <Plus className="size-3.5" aria-hidden />
                Extract your first job
              </Link>
            </V4Empty>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
            {jobs.map((job) => {
              const pay = payLine(job)
              const verdict = job.verdict ? VERDICT_CHIP[job.verdict] : null
              return (
                <li key={job.id}>
                  <Link href={`/upwork/${job.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bone">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-[13px] font-medium text-ink">{job.title}</p>
                        {verdict && <V4Chip tone={verdict.tone}>{verdict.label}</V4Chip>}
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-graphite">
                        {[job.clientName, pay, job.connectsCost ? `${job.connectsCost} Connects` : null].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="text-[13px] font-medium tabular-nums text-ink">
                          {job.score != null ? `${job.score}/10` : '—'}
                        </p>
                        <p className="text-[11px] text-stone">{upworkStageLabel(job.status)}</p>
                      </div>
                      <ChevronRight className="size-3.5 text-stone" aria-hidden />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </V4Panel>
    </div>
  )
}
