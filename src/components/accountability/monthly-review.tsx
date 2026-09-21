'use client'

import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from 'cn'
import { StatusBadge } from '@/components/ui/status-badge'
import type { MonthlyReviewView } from '@/lib/domain/types'

interface MonthlyReviewProps {
  data: MonthlyReviewView
}

export function MonthlyReview({ data }: MonthlyReviewProps) {
  const { review, personName, identityName, rewardEligibility, policies } = data

  const execution = review.executionSnapshot as Record<string, number> | undefined
  const quality = review.qualitySnapshot as Record<string, number> | undefined
  const outcome = review.outcomeSnapshot as Record<string, number> | undefined
  const consistency = review.consistencySnapshot as Record<string, number> | undefined

  return (
    <section className="rounded-lg border border-line bg-bone-raised p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
            Monthly Review
          </p>
          <h2 className="mt-1 text-[20px] font-light tracking-[-0.02em] text-ink">
            {personName} · {identityName}
          </h2>
          <p className="text-[12px] text-graphite">{review.month}</p>
        </div>
        <StatusBadge
          status={review.reviewStatus === 'completed' ? 'Completed' : review.reviewStatus === 'adjusted' ? 'Adjusted' : 'Pending'}
          variant={review.reviewStatus === 'completed' ? 'success' : review.reviewStatus === 'adjusted' ? 'warning' : 'cobalt'}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] text-stone">Working Days</p>
          <p className="text-[14px] text-ink">
            {consistency?.completedDays ?? 0} / {consistency?.expectedDays ?? 0}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-stone">Completion</p>
          <p className="text-[14px] text-ink">{execution?.completionRate ?? 0}%</p>
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Execution
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <MetricRow label="Prospects" value={execution?.qualifiedProspects ?? 0} />
          <MetricRow label="Connections" value={execution?.connections ?? 0} />
          <MetricRow label="First DMs" value={execution?.firstDms ?? 0} />
          <MetricRow label="Emails" value={execution?.emails ?? 0} />
          <MetricRow label="Follow-ups" value={execution?.followups ?? 0} />
          <MetricRow label="Meaningful touches" value={execution?.meaningfulTouches ?? 0} />
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Quality
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <MetricRow label="Valid prospect rate" value={`${quality?.validProspectRate ?? 0}%`} />
          <MetricRow label="Duplicate rate" value={`${quality?.duplicateRate ?? 0}%`} />
          <MetricRow label="Qualified reply rate" value={`${quality?.qualifiedReplyRate ?? 0}%`} />
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Commercial Outcomes
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <MetricRow label="Replies" value={outcome?.replies ?? 0} />
          <MetricRow label="Qualified conversations" value={outcome?.qualifiedConversations ?? 0} />
          <MetricRow label="Calls" value={outcome?.calls ?? 0} />
          <MetricRow label="Proposals" value={outcome?.proposals ?? 0} />
          <MetricRow label="Wins" value={outcome?.wins ?? 0} />
          <MetricRow label="Won revenue" value={`$${(outcome?.wonRevenue ?? 0).toLocaleString()}`} />
        </div>
      </div>

      {rewardEligibility.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
            Reward Eligibility
          </p>
          <div className="mt-2 space-y-2">
            {rewardEligibility.map((elig) => {
              const policy = policies.find((p) => p.id === elig.policyId)
              const reason = elig.reasonSnapshot as Record<string, unknown> | undefined
              return (
                <div key={elig.id} className="flex items-center justify-between rounded-md border border-line bg-bone px-3 py-2">
                  <div>
                    <span className="text-[12px] font-medium text-ink">{policy?.name ?? 'Unknown'}</span>
                    <span className="ml-2 text-[11px] text-graphite">{policy?.tier}</span>
                  </div>
                  <StatusBadge
                    status={elig.status === 'approved' ? 'Approved' : elig.status === 'rejected' ? 'Rejected' : 'Pending'}
                    variant={elig.status === 'approved' ? 'success' : elig.status === 'rejected' ? 'danger' : 'cobalt'}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {review.managerNote && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
            Manager Notes
          </p>
          <p className="mt-1 text-[12px] text-graphite">{review.managerNote}</p>
        </div>
      )}
    </section>
  )
}

function MetricRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-graphite">{label}</span>
      <span className="text-[12px] font-medium text-ink">{value}</span>
    </div>
  )
}
