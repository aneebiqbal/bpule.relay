'use client'

import { CheckCircle2, XCircle, Clock } from 'lucide-react'
import { cn } from 'cn'
import { StatusBadge } from '@/components/ui/status-badge'
import type { RewardEligibility, RewardPolicy } from '@/lib/domain/types'

interface RewardEligibilityProps {
  eligibility: RewardEligibility[]
  policies: RewardPolicy[]
  onApprove: (id: string) => void
  onReject: (id: string) => void
}

export function RewardEligibilityPanel({ eligibility, policies, onApprove, onReject }: RewardEligibilityProps) {
  if (eligibility.length === 0) {
    return (
      <section className="rounded-lg border border-line bg-bone-raised p-5">
        <h3 className="text-[14px] font-medium text-ink">Reward Eligibility</h3>
        <p className="mt-2 text-[13px] text-graphite">No reward eligibility calculated yet.</p>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-line bg-bone-raised p-5">
      <h3 className="text-[14px] font-medium text-ink">Reward Eligibility</h3>

      <div className="mt-3 space-y-3">
        {eligibility.map((elig) => {
          const policy = policies.find((p) => p.id === elig.policyId)
          const reason = elig.reasonSnapshot as Record<string, unknown> | undefined

          return (
            <div key={elig.id} className="rounded-md border border-line bg-bone p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[13px] font-medium text-ink">{policy?.name ?? 'Unknown'}</span>
                  <span className="ml-2 text-[11px] uppercase text-graphite">{policy?.tier}</span>
                </div>
                <StatusBadge
                  status={elig.status === 'approved' ? 'Approved' : elig.status === 'rejected' ? 'Rejected' : 'Pending'}
                  variant={elig.status === 'approved' ? 'success' : elig.status === 'rejected' ? 'danger' : 'cobalt'}
                />
              </div>

              {reason && (
                <div className="mt-2 space-y-1">
                  {reason.completionRate !== undefined && (
                    <p className="text-[11px] text-graphite">
                      Completion: {String(reason.completionRate)}% (min: {String(reason.minCompletion)})
                    </p>
                  )}
                  {reason.qualityScore !== undefined && (
                    <p className="text-[11px] text-graphite">
                      Quality: {String(reason.qualityScore)} (min: {String(reason.minQuality)})
                    </p>
                  )}
                </div>
              )}

              {elig.status === 'pending' && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onApprove(elig.id)}
                    className="flex items-center gap-1 rounded-md bg-status-success px-3 py-1.5 text-[12px] font-medium text-white hover:bg-status-success/90"
                  >
                    <CheckCircle2 className="size-3" />
                    Approve
                  </button>
                  <button
                    onClick={() => onReject(elig.id)}
                    className="flex items-center gap-1 rounded-md bg-status-error px-3 py-1.5 text-[12px] font-medium text-white hover:bg-status-error/90"
                  >
                    <XCircle className="size-3" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
