import { notFound } from 'next/navigation'
import { createScoutStore } from '@/lib/store'
import { computeUpworkScore } from '@/lib/score/upwork-rubric'
import { MessageCircle, DollarSign, Users, Tag } from 'lucide-react'
import { cn } from 'cn'

export const dynamic = 'force-dynamic'

const VERDICT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  apply: { bg: 'bg-status-send/10', text: 'text-status-send', label: 'Apply' },
  apply_if_connects: { bg: 'bg-status-research/10', text: 'text-status-research', label: 'If Connects' },
  skip: { bg: 'bg-paper-tint', text: 'text-slate', label: 'Skip' },
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

  const verdict = score.verdict ? VERDICT_STYLE[score.verdict] : VERDICT_STYLE.skip

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <header className="reveal-up space-y-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium',
              verdict.bg,
              verdict.text,
            )}
          >
            {verdict.label}
          </span>
          <span className="font-mono text-xs text-slate">{job.connectsCost} Connects</span>
        </div>
        <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">{job.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate">
          {job.budgetMin && job.budgetMax ? (
            <span className="flex items-center gap-1">
              <DollarSign className="size-3.5" />
              ${job.budgetMin}–${job.budgetMax} fixed
            </span>
          ) : job.hourlyRateMin && job.hourlyRateMax ? (
            <span className="flex items-center gap-1">
              <DollarSign className="size-3.5" />
              ${job.hourlyRateMin}–${job.hourlyRateMax}/hr
            </span>
          ) : (
            <span>Budget not stated</span>
          )}
          <span className="text-line">·</span>
          <span className="flex items-center gap-1">
            <Users className="size-3.5" />
            {job.proposalCount !== null ? `${job.proposalCount} proposals` : 'proposals unknown'}
          </span>
        </div>
      </header>

      {/* Score card */}
      <section className="reveal-up stagger-1 rounded-2xl border border-line bg-paper p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative flex size-16 items-center justify-center">
              <ScoreRing score={score.total} max={10} size={64} />
            </div>
            <div>
              <p className="text-sm text-slate">Score</p>
              <p className="font-mono text-2xl font-medium text-ink">
                {score.total} <span className="text-sm text-slate">/ 10</span>
              </p>
            </div>
          </div>
          {job.messages.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-slate">
              <MessageCircle className="size-4" />
              {job.messages.length} message{job.messages.length === 1 ? '' : 's'}
            </div>
          )}
        </div>

        {/* Breakdown */}
        <div className="mt-6 grid gap-2 border-t border-line pt-5 sm:grid-cols-2">
          {score.breakdown.map((item) => {
            const frac = item.max > 0 ? item.points / item.max : 0
            return (
              <div key={item.category + item.label} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-ink">{item.label}</span>
                    <span className="font-mono text-xs text-slate">
                      {item.points}/{item.max}
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-paper-tint">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        frac >= 1 ? 'bg-status-send' : frac > 0 ? 'bg-gold' : 'bg-line',
                      )}
                      style={{ width: `${Math.max(frac * 100, frac > 0 ? 8 : 0)}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Description */}
      <section className="reveal-up stagger-2 rounded-2xl border border-line bg-paper p-6">
        <h2 className="text-sm font-medium text-ink">Description</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{job.description}</p>
      </section>

      {/* Urgency + Skills side by side */}
      <div className="reveal-up stagger-3 grid gap-4 sm:grid-cols-2">
        {job.urgencySignal ? (
          <div className="rounded-2xl border border-line bg-paper p-5">
            <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
              <MessageCircle className="size-3.5 text-status-research" />
              Urgency signal
            </h2>
            <p className="mt-2 text-sm text-ink/80">{job.urgencySignal}</p>
          </div>
        ) : null}

        {job.requiredSkills.length > 0 ? (
          <div className="rounded-2xl border border-line bg-paper p-5">
            <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
              <Tag className="size-3.5 text-slate" />
              Required skills
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {job.requiredSkills.map((s) => (
                <span
                  key={s}
                  className="rounded-lg bg-paper-tint px-2.5 py-1 font-mono text-xs text-ink"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Messages */}
      {job.messages.length > 0 ? (
        <section className="reveal-up stagger-4 rounded-2xl border border-line bg-paper p-6">
          <h2 className="text-sm font-medium text-ink">Messages</h2>
          <ul className="mt-4 divide-y divide-line">
            {job.messages.map((m) => (
              <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink">{m.type}</span>
                  <span className="font-mono text-xs text-slate">
                    {m.sentAt
                      ? `sent ${new Date(m.sentAt).toLocaleDateString()}`
                      : `drafted ${new Date(m.createdAt).toLocaleDateString()}`}
                  </span>
                </div>
                {m.sentText ? (
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate">
                    {m.sentText}
                  </p>
                ) : m.draftText ? (
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate">
                    {m.draftText}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function ScoreRing({ score, size = 64, max = 10 }: { score: number; size?: number; max?: number }) {
  const pct = Math.min(Math.max(score, 0) / max, 1)
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const color =
    pct >= 0.7
      ? 'var(--status-send)'
      : pct >= 0.4
        ? 'var(--status-research)'
        : 'var(--slate)'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--paper-tint)" strokeWidth="5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-base font-medium text-ink">{score}</span>
      </div>
    </div>
  )
}
