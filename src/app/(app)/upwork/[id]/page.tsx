import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createScoutStore } from '@/lib/store'
import { computeUpworkScore } from '@/lib/score/upwork-rubric'
import { matchProfilesToJob } from '@/lib/upwork/score'
import { loadSenderProfiles } from '@/lib/relay/routing-context'
import { createServiceSupabase } from '@/lib/supabase/service'
import { getAuthContext } from '@/lib/auth/organization'
import type { RoutingResult } from '@/lib/relay/sender-routing-engine'
import { ArrowLeft } from 'lucide-react'
import { cn } from 'cn'
import { upworkStageLabel } from '@/lib/upwork/pipeline'
import { UpworkJobActions } from '@/components/upwork-job-actions'
import { UpworkJobTimeline } from '@/components/upwork-job-timeline'
import { UpworkCommunication } from '@/components/upwork-communication'
import { V4PageHeader, V4Panel, V4PanelHeader, V4Chip } from '@/components/v4/primitives'
import {
  filterAssignedProfilesByChannel,
  listAssignedProfiles,
} from '@/lib/profiles/assigned-profiles'

export const dynamic = 'force-dynamic'

const VERDICT_CHIP: Record<string, { tone: 'success' | 'warning' | 'neutral'; label: string }> = {
  apply: { tone: 'success', label: 'Apply' },
  apply_if_connects: { tone: 'warning', label: 'If Connects' },
  skip: { tone: 'neutral', label: 'Skip' },
}

export default async function UpworkJobPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const store = await createScoutStore()
  const job = await store.getUpworkJob(id)
  if (!job) notFound()

  // Only Upwork-capable profiles assigned to this rep. An owned-but-unassigned
  // LinkedIn profile must never appear here.
  const profiles = filterAssignedProfilesByChannel(
    await listAssignedProfiles(),
    'upwork',
  ).map((assigned) => assigned.profile)

  const score = computeUpworkScore({
    budgetMin: job.budgetMin,
    budgetMax: job.budgetMax,
    hourlyRateMin: job.hourlyRateMin,
    hourlyRateMax: job.hourlyRateMax,
    proposalCount: job.proposalCount,
    requiredSkills: job.requiredSkills,
    urgencySignal: job.urgencySignal,
    description: job.description,
    rawInput: job.rawInput,
    title: job.title,
  })

  // Profile match is a separate ranking: it never changes the job score.
  let profileMatch: RoutingResult | null = null
  try {
    const auth = await getAuthContext()
    if (auth) {
      const senders = await loadSenderProfiles(createServiceSupabase(), auth.orgId, auth.repId)
      if (senders.length) profileMatch = matchProfilesToJob(score.canonical.facts, senders, null)
    }
  } catch { profileMatch = null }

  const verdict = job.verdict ? VERDICT_CHIP[job.verdict] : VERDICT_CHIP.skip
  // Read the canonical job facts for honest display: a source proposal range
  // is shown verbatim, and missing Connects stays unknown (QA BUG-11-02/03).
  const jobFacts = (job.jobFacts ?? null) as {
    proposals?: { count: number | null; range?: [number, number] | null; evidence?: string | null }
    connects?: number | null
    rate?: { type?: string; fixedBudget?: number | null }
  } | null
  const proposalLabel = jobFacts?.proposals?.evidence
    ?? (job.proposalCount !== null
      ? (jobFacts?.proposals?.range ? `~${job.proposalCount} estimated` : `${job.proposalCount} proposals`)
      : null)
  const connectsLabel = jobFacts?.connects != null
    ? `${jobFacts.connects} Connects`
    : (job.connectsCost ? `${job.connectsCost} Connects` : 'Connects not stated')
  const facts = [
    payLabel(job),
    job.experienceLevel,
    job.duration,
    job.weeklyHours,
    job.engagementType,
    proposalLabel,
    connectsLabel,
    job.messages.length > 0 ? `${job.messages.length} message${job.messages.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean)

  return (
    <div className="space-y-5">
      <Link
        href="/upwork"
        className="inline-flex items-center gap-1 text-[12px] text-graphite transition-colors hover:text-ink lg:hidden"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All Upwork jobs
      </Link>

      <V4PageHeader
        eyebrow="Sales / Upwork"
        title={job.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{facts.join(' · ') || 'No extracted facts yet.'}</span>
            <span className="text-stone">·</span>
            <span className="tabular-nums">{score.total} / 10</span>
            <span className="text-stone">·</span>
            <span>{upworkStageLabel(job.status)}</span>
          </span>
        }
        actions={
          <V4Chip tone={verdict.tone} className="px-3 py-1.5 text-[12px]">{verdict.label}</V4Chip>
        }
      />

      {/* Proposal workspace first: the action a saved job exists for. */}
      <V4Panel>
        <div className="mt-1">
          <UpworkJobActions
            jobId={id}
            jobTitle={job.title}
            jobScore={job.score}
            profiles={profiles}
            matchedProofs={[]}
            savedDraft={(job.messages ?? []).find((m) => m.type === 'cover' && !m.sentAt && m.draftText)?.draftText ?? null}
          />
        </div>
      </V4Panel>

      <V4Panel>
        <V4PanelHeader
          eyebrow="Score"
          title={`Why this job scores ${score.total} / 10`}
          hint="Canonical rubric math — a separate profile match never changes it"
        />
        <div className="mt-4 space-y-4">
          <p className="text-[13px] text-graphite">
            {jobFacts?.connects != null
              ? `Spend ${jobFacts.connects} Connects only if you are sending this proposal.`
              : job.connectsCost
                ? `Spend ${job.connectsCost} Connects only if you are sending this proposal.`
                : 'Connects cost not stated — confirm it on Upwork before applying.'}
          </p>

          {(score.canonical.reasons.length > 0 || score.canonical.watchOut.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {score.canonical.reasons.length > 0 && (
                <ul className="space-y-1 text-[12px] text-ink">
                  {score.canonical.reasons.map((r) => <li key={r}>+ {r}</li>)}
                </ul>
              )}
              {score.canonical.watchOut.length > 0 && (
                <ul className="space-y-1 text-[12px] text-status-warning">
                  {score.canonical.watchOut.map((r) => <li key={r}>! {r}</li>)}
                </ul>
              )}
            </div>
          )}

          {profileMatch && profileMatch.rankings.length > 0 && (
            <div className="rounded-xl bg-bone px-4 py-3 ring-1 ring-line">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Profile match (separate from the job score)</p>
              <ul className="mt-2 space-y-1">
                {profileMatch.rankings.slice(0, 4).map((r, i) => (
                  <li key={r.senderId} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="truncate text-ink">
                      {i + 1}. {r.name ?? 'Unnamed'}{r.reasons[0] ? <span className="text-graphite"> · {r.reasons[0]}</span> : null}
                    </span>
                    <span className={cn('shrink-0 font-mono font-medium', r.profileMatch >= 70 ? 'text-status-success' : r.profileMatch >= 40 ? 'text-orange' : 'text-stone')}>
                      {r.profileMatch}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-2 border-t border-line pt-4 sm:grid-cols-2">
            {score.breakdown.map((item) => {
              const frac = item.max > 0 ? item.points / item.max : 0
              return (
                <div key={item.category + item.label} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between text-[13px]">
                      <span className="text-ink">{item.label}</span>
                      <span className="font-mono text-[11px] text-stone">{item.points}/{item.max}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-bone">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          frac >= 1 ? 'bg-status-success' : frac > 0 ? 'bg-orange' : 'bg-line',
                        )}
                        style={{ width: `${Math.max(frac * 100, frac > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </V4Panel>

      <UpworkJobTimeline job={job} />

      <V4Panel>
        <V4PanelHeader eyebrow="Job post" title="Description" />
        <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-ink/80">{job.description}</p>
      </V4Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {job.urgencySignal ? (
          <V4Panel className="h-full">
            <V4PanelHeader eyebrow="Signal" title="Urgency" />
            <p className="mt-3 text-[13px] text-ink/80">{job.urgencySignal}</p>
          </V4Panel>
        ) : null}

        {job.requiredSkills.length > 0 ? (
          <V4Panel className="h-full">
            <V4PanelHeader eyebrow="Requirements" title="Required skills" />
            <div className="mt-3 flex flex-wrap gap-2">
              {job.requiredSkills.map((s) => (
                <span key={s} className="rounded-full bg-bone px-2.5 py-1 font-mono text-[11px] text-ink ring-1 ring-line">
                  {s}
                </span>
              ))}
            </div>
          </V4Panel>
        ) : null}
      </div>

      {job.applicationRequirements.length > 0 && (
        <V4Panel>
          <V4PanelHeader eyebrow="Requirements" title="What they ask for" />
          <ul className="mt-3 space-y-1.5 text-[13px] text-graphite">
            {job.applicationRequirements.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </V4Panel>
      )}

      {job.screeningQuestions.length > 0 && (
        <V4Panel>
          <V4PanelHeader eyebrow="Screening" title="Screening questions" hint="Answered inside the generated proposal" />
          <ul className="mt-3 space-y-2">
            {job.screeningQuestions.map((q, i) => (
              <li key={q} className="rounded-xl bg-bone px-3 py-2 text-[13px] text-graphite ring-1 ring-line">
                <span className="font-medium text-ink">Q{i + 1}.</span> {q}
              </li>
            ))}
          </ul>
        </V4Panel>
      )}

      <UpworkCommunication jobId={id} job={job} />
    </div>
  )
}

function payLabel(job: {
  budgetMin: number | null
  budgetMax: number | null
  hourlyRateMin: number | null
  hourlyRateMax: number | null
}): string | null {
  if (job.hourlyRateMin && job.hourlyRateMax) {
    return job.hourlyRateMin === job.hourlyRateMax
      ? `$${job.hourlyRateMin}/hr`
      : `$${job.hourlyRateMin}–$${job.hourlyRateMax}/hr`
  }
  if (job.budgetMin && job.budgetMax) {
    return job.budgetMin === job.budgetMax
      ? `$${job.budgetMin.toLocaleString()} fixed`
      : `$${job.budgetMin.toLocaleString()}–$${job.budgetMax.toLocaleString()} fixed`
  }
  if (job.budgetMin) return `$${job.budgetMin.toLocaleString()} fixed`
  if (job.budgetMax) return `Up to $${job.budgetMax.toLocaleString()}`
  return null
}
