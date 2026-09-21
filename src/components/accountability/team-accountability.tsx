'use client'

import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from 'cn'
import { StatusBadge } from '@/components/ui/status-badge'
import type { TeamAccountabilityView, TeamMemberView } from '@/lib/domain/types'

interface TeamAccountabilityProps {
  data: TeamAccountabilityView
}

export function TeamAccountability({ data }: TeamAccountabilityProps) {
  return (
    <section className="rounded-lg border border-line bg-bone-raised p-5">
      <h3 className="text-[14px] font-medium text-ink">Team Today</h3>

      <div className="mt-3 space-y-2">
        {(data.members ?? []).map((member) => (
          <TeamMemberRow key={member.personId} member={member} />
        ))}
      </div>

      {(data.exceptions ?? []).length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
            Exceptions
          </p>
          <div className="mt-2 space-y-2">
            {(data.exceptions ?? []).map((exc) => (
              <div key={exc.id} className="flex items-center gap-2 rounded-md border border-status-warning/20 bg-status-warning/5 px-3 py-2">
                <AlertTriangle className="size-3.5 text-status-warning" />
                <span className="text-[12px] text-ink">
                  {exc.exceptionReason?.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(data.needsAttention ?? []).length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
            Needs Attention
          </p>
          <div className="mt-2 space-y-2">
            {(data.needsAttention ?? []).map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 rounded-md border border-status-warning/20 bg-status-warning/5 px-3 py-2">
                <AlertTriangle className="size-3.5 text-status-warning" />
                <span className="text-[12px] text-ink">{item.repName}: {item.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function TeamMemberRow({ member }: { member: TeamMemberView }) {
  const pct = member.totalTarget > 0 ? Math.round((member.totalCompleted / member.totalTarget) * 100) : 0

  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-bone px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-ink">{member.personName}</span>
          <span className="text-[11px] text-graphite">{member.identityName}</span>
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line/60">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              member.status === 'completed' ? 'bg-status-success' : member.status === 'at_risk' ? 'bg-status-warning' : 'bg-orange',
            )}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>
      <span className="shrink-0 text-[12px] text-graphite">
        {member.totalCompleted}/{member.totalTarget}
      </span>
      <StatusBadge
        status={member.status === 'completed' ? 'Complete' : member.status === 'at_risk' ? 'At Risk' : 'On Track'}
        variant={member.status === 'completed' ? 'success' : member.status === 'at_risk' ? 'warning' : 'cobalt'}
      />
    </div>
  )
}
