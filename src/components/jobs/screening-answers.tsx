'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, TriangleAlert } from 'lucide-react'
import type { ScreeningAnswer } from '@/lib/job-discovery/screening'

/**
 * Screening answers for one job + profile.
 *
 * Drafts are built only from verified profile evidence. Anything Relay does not
 * know (availability, salary, authorization, timezone) is shown as a required
 * human answer — never a guess.
 */
export function ScreeningAnswers({ jobId, profileId }: { jobId: string; profileId: string | null }) {
  const [answers, setAnswers] = useState<ScreeningAnswer[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    fetch(`/api/jobs/${jobId}/screening?profileId=${profileId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Could not load screening answers.'))))
      .then((data: { answers: ScreeningAnswer[] }) => {
        if (!cancelled) setAnswers(data.answers)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load screening answers.')
      })
    return () => {
      cancelled = true
    }
  }, [jobId, profileId])

  if (!profileId) return null
  if (error) return <p className="text-xs text-status-warning">{error}</p>
  if (!answers) return <p className="text-xs text-stone">Loading screening answers…</p>

  const pending = answers.filter((row) => row.status === 'needs_human').length

  return (
    <div className="rounded-xl bg-bone p-3 ring-1 ring-line">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-stone">Screening answers</p>
        {pending > 0 && (
          <span className="text-[11px] text-status-warning">
            {pending} need{pending === 1 ? 's' : ''} your answer
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {answers.map((row) => (
          <li key={row.id} className="text-xs">
            <p className="font-medium text-ink">{row.question}</p>
            {row.status === 'draft' && row.answer ? (
              <p className="mt-0.5 flex gap-1 text-graphite">
                <ShieldCheck className="mt-0.5 size-3 shrink-0 text-status-success" aria-hidden />
                {row.answer}
              </p>
            ) : (
              <p className="mt-0.5 flex gap-1 text-status-warning">
                <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                Needs your answer — Relay does not hold this fact.
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
