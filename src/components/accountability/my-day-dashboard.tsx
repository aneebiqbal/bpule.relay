'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Clock, ArrowRight, AlertTriangle } from 'lucide-react'
import { cn } from 'cn'
import { StatusBadge } from '@/components/ui/status-badge'
import type { MyDayView, DailyProgress } from '@/lib/domain/types'

interface MyDayDashboardProps {
  data: MyDayView
}

export function MyDayDashboard({ data }: MyDayDashboardProps) {
  const completion = data.totalTarget > 0
    ? Math.round((data.totalCompleted / data.totalTarget) * 100)
    : 0

  return (
    <section className="rounded-lg border border-line bg-bone-raised p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
            Your Day
          </p>
          <h2 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">
            {getGreeting()}, {data.personName}
          </h2>
        </div>
        <StatusBadge
          status={data.overallStatus === 'completed' ? 'Complete' : data.overallStatus === 'at_risk' ? 'At Risk' : 'On Track'}
          variant={data.overallStatus === 'completed' ? 'success' : data.overallStatus === 'at_risk' ? 'warning' : 'cobalt'}
        />
      </div>

      {data.contracts.length > 0 && (
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[32px] font-light tracking-[-0.03em] text-orange">
            {data.totalCompleted}
          </span>
          <span className="text-[14px] text-graphite">
            / {data.totalTarget} meaningful touches
          </span>
        </div>
      )}

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line/60">
        <div
          className="h-full rounded-full bg-orange transition-all duration-500"
          style={{ width: `${Math.min(completion, 100)}%` }}
        />
      </div>

      {data.progress && (
        <div className="mt-4 space-y-2">
          <ProgressRow label="Qualified prospects" completed={data.progress.qualifiedProspects.completed} target={data.progress.qualifiedProspects.target} />
          <ProgressRow label="Connections" completed={data.progress.connections.completed} target={data.progress.connections.target} />
          <ProgressRow label="First DMs" completed={data.progress.firstDms.completed} target={data.progress.firstDms.target} />
          <ProgressRow label="Emails" completed={data.progress.emails.completed} target={data.progress.emails.target} />
          <ProgressRow label="Follow-ups" completed={data.progress.followups.completed} target={data.progress.followups.target} />
          <ProgressRow label="Due replies" completed={data.progress.dueReplies.completed} target={data.progress.dueReplies.target} />
          <ProgressRow label="Logging" completed={data.progress.logging.completed} target={data.progress.logging.target} />
        </div>
      )}

      {data.canCloseDay && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-status-success/20 bg-status-success/5 px-3 py-2">
          <CheckCircle2 className="size-4 text-status-success" />
          <span className="text-[13px] text-status-success">Day complete — ready to close</span>
        </div>
      )}

      {data.nextAction && !data.canCloseDay && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-line bg-bone px-3 py-2">
          <ArrowRight className="size-4 text-orange" />
          <span className="text-[13px] text-ink">{data.nextAction}</span>
        </div>
      )}
    </section>
  )
}

function ProgressRow({ label, completed, target }: { label: string; completed: number; target: number }) {
  const remaining = Math.max(0, target - completed)
  const pct = target > 0 ? Math.min(Math.round((completed / target) * 100), 100) : 0

  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-[12px] text-graphite">{label}</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-line/60">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            remaining === 0 ? 'bg-status-success' : 'bg-orange',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn(
        'w-16 shrink-0 text-right text-[12px] font-medium',
        remaining === 0 ? 'text-status-success' : 'text-ink',
      )}>
        {completed}/{target}
      </span>
      {remaining > 0 && (
        <span className="w-12 shrink-0 text-right text-[11px] text-stone">
          {remaining} left
        </span>
      )}
      {remaining === 0 && (
        <CheckCircle2 className="size-3.5 shrink-0 text-status-success" />
      )}
    </div>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
