'use client'

import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, AlertTriangle, Target, Users } from 'lucide-react'
import { cn } from 'cn'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'

interface DrillDownData {
  rep: { id: string; name: string; role: string }
  identities: Array<{
    assignmentId: string
    revenueIdentityId: string
    identityName: string
    title: string | null
    channel: string
  }>
  targets: Array<{
    assignmentId: string
    identity: { id: string; identityName: string; title: string | null; channel: string }
    targets: Array<{
      targetId: string
      activityType: string
      targetCount: number
      completedCount: number
      remaining: number
      status: string
    }>
  }>
  today: string
  isManager: boolean
  managedTeamIds: string[]
}

export function ManagerDrillDown({ dataPromise }: { dataPromise: Promise<DrillDownData> }) {
  const data = use(dataPromise)

  const totalTarget = data.targets.reduce((sum, t) => sum + t.targets.reduce((s, t) => s + t.targetCount, 0), 0)
  const totalCompleted = data.targets.reduce((sum, t) => sum + t.targets.reduce((s, t) => s + t.completedCount, 0), 0)
  const totalRemaining = Math.max(0, totalTarget - totalCompleted)
  const needsAttention = data.targets.some((t) => t.targets.some((t) => t.status === 'at_risk' || t.status === 'missed'))

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-md p-1.5 text-graphite transition-colors hover:bg-bone-raised hover:text-ink"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Manager View
        </p>
      </div>

      <header className="flex items-start gap-4">
        <div className="flex size-12 items-center justify-center rounded-lg bg-ink text-sm font-medium text-bone">
          {data.rep.name.charAt(0)}
        </div>
        <div>
          <h1 className="text-[24px] font-light tracking-[-0.02em] text-ink">
            {data.rep.name}
          </h1>
          <p className="text-[13px] text-graphite">
            {data.rep.role} · {data.identities.length} responsibilities
          </p>
        </div>
      </header>

      <section className="rounded-lg border border-line bg-bone-raised p-5">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-stone" />
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-ststone">
            Today
          </p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded border border-line bg-bone px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-ststone">Completed</p>
            <p className="mt-0.5 text-[15px] font-medium text-ink">{totalCompleted}</p>
          </div>
          <div className="rounded border border-line bg-bone px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-ststone">Target</p>
            <p className="mt-0.5 text-[15px] font-medium text-ink">{totalTarget}</p>
          </div>
          <div className="rounded border border-line bg-bone px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-ststone">Remaining</p>
            <p className="mt-0.5 text-[15px] font-medium text-orange">{totalRemaining}</p>
          </div>
        </div>
        {needsAttention && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-status-warning/20 bg-status-warning/5 px-3 py-2">
            <AlertTriangle className="size-4 text-status-warning" />
            <span className="text-[12px] text-ink">Has items needing attention</span>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-ststone">
          Responsibilities
        </p>
        {data.identities.length === 0 ? (
          <p className="text-[13px] text-graphite">No Revenue Identities assigned.</p>
        ) : (
          <div className="space-y-2">
            {data.identities.map((identity) => {
              const identityTargets = data.targets.find(
                (t) => t.identity.id === identity.revenueIdentityId
              )?.targets ?? []
              const target = identityTargets.reduce((sum, t) => sum + t.targetCount, 0)
              const completed = identityTargets.reduce((sum, t) => sum + t.completedCount, 0)
              const remaining = Math.max(0, target - completed)

              return (
                <div key={identity.assignmentId} className="rounded-lg border border-line bg-bone-raised p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-ink">{identity.identityName}</p>
                      <p className="text-[11px] text-graphite">
                        {identity.title ?? 'No title'} · {identity.channel}
                      </p>
                    </div>
                    {remaining === 0 ? (
                      <StatusBadge status="Complete" variant="success" />
                    ) : (
                      <span className="text-[12px] font-medium text-orange">{remaining} remaining</span>
                    )}
                  </div>
                  {identityTargets.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {identityTargets.map((t) => (
                        <div key={t.targetId} className="flex items-center gap-2">
                          <span className="text-[11px] text-graphite">{t.activityType}</span>
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-line/60">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                t.remaining === 0 ? 'bg-status-success' : 'bg-orange',
                              )}
                              style={{ width: `${Math.min(Math.round((t.completedCount / t.targetCount) * 100), 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-stone">
                            {t.completedCount}/{t.targetCount}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

export function ManagerDrillDownSkeleton() {
  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex items-start gap-4">
        <Skeleton className="size-12 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-24" />
      <div className="space-y-2">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </div>
  )
}
