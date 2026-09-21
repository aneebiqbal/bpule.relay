'use client'

import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from 'cn'
import { StatusBadge } from '@/components/ui/status-badge'
import type { IdentityAccountabilityView } from '@/lib/domain/types'

interface IdentityDashboardProps {
  data: IdentityAccountabilityView
}

export function IdentityDashboard({ data }: IdentityDashboardProps) {
  const completion = data.todayProgress.meaningfulTouches.target > 0
    ? Math.round((data.todayProgress.meaningfulTouches.completed / data.todayProgress.meaningfulTouches.target) * 100)
    : 0

  return (
    <section className="rounded-lg border border-line bg-bone-raised p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
            Revenue Identity
          </p>
          <h2 className="mt-1 text-[20px] font-light tracking-[-0.02em] text-ink">
            {data.identityName}
          </h2>
        </div>
        <StatusBadge
          status={data.qualityStatus === 'healthy' ? 'Healthy' : data.qualityStatus === 'review_required' ? 'Review' : 'Unknown'}
          variant={data.qualityStatus === 'healthy' ? 'success' : data.qualityStatus === 'review_required' ? 'warning' : 'cobalt'}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] text-stone">Annual Goal</p>
          <p className="text-[18px] font-light text-ink">${data.annualRevenueTarget.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[11px] text-stone">Today</p>
          <p className="text-[18px] font-light text-ink">
            {data.todayProgress.meaningfulTouches.completed}/{data.todayProgress.meaningfulTouches.target}
          </p>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line/60">
        <div
          className="h-full rounded-full bg-orange transition-all duration-500"
          style={{ width: `${Math.min(completion, 100)}%` }}
        />
      </div>

      {data.allocations.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
            Assigned Operators
          </p>
          <div className="mt-2 space-y-1">
            {data.allocations.map((alloc) => (
              <div key={alloc.id} className="flex items-center justify-between">
                <span className="text-[12px] text-ink">{alloc.personId}</span>
                <span className="text-[12px] text-graphite">{alloc.allocationPct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Revenue
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div>
            <p className="text-[11px] text-stone">Won</p>
            <p className="text-[14px] font-medium text-status-success">${data.revenue.won.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] text-stone">Pipeline</p>
            <p className="text-[14px] font-medium text-ink">${data.revenue.pipeline.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] text-stone">Remaining</p>
            <p className="text-[14px] font-medium text-orange">${data.revenue.remaining.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
