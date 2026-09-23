'use client'

import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, Target } from 'lucide-react'
import { cn } from 'cn'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { activityLabel } from '@/lib/admin/team-live'

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
  openLeads?: Array<{
    id: string
    company: string
    contactName: string | null
    statusLabel: string
    score: number | null
  }>
  dayCloses?: Array<{
    identityId: string
    identityName: string
    channel: string
    status: string
    exceptionReason: string | null
    allocationPct: number
    progress: {
      connections: { completed: number; target: number; remaining: number }
      firstDms: { completed: number; target: number; remaining: number }
      emails: { completed: number; target: number; remaining: number }
      followups: { completed: number; target: number; remaining: number }
    }
    dayCloseStatus: string
  }>
}

function OpenWork({ leads }: { readonly leads: NonNullable<DrillDownData['openLeads']> }) {
  if (leads.length === 0) {
    return <p className="text-[13px] text-graphite">No open leads in the queue.</p>
  }
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bone-raised">
      <ul className="divide-y divide-line/60">
        {leads.map((lead) => (
          <li key={lead.id}>
            <Link href={`/leads/${lead.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-bone">
              <span className="min-w-0 truncate text-[13px] text-ink">
                {lead.company}
                {lead.contactName ? <span className="text-graphite"> · {lead.contactName}</span> : null}
              </span>
              <span className="shrink-0 text-[11px] text-graphite">
                {lead.statusLabel}{lead.score !== null ? ` · ${lead.score}` : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
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
          href="/team"
          className="rounded-md p-1.5 text-graphite transition-colors hover:bg-bone-raised hover:text-ink"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Team
        </p>
      </div>

      <header className="flex items-start gap-4">
        <div className="flex size-12 items-center justify-center rounded-lg bg-solid text-sm font-medium text-on-solid">
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
          Working on
        </p>
        <OpenWork leads={data.openLeads ?? []} />
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
                          <span className="text-[11px] text-graphite">{activityLabel(t.activityType)}</span>
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

      {/* Accountability OS: Day Close Progress */}
      {data.dayCloses && data.dayCloses.length > 0 && (
        <section className="space-y-3">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-ststone">
            Today&apos;s Accountability (Contracts)
          </p>
          <div className="space-y-2">
            {data.dayCloses.map((dc) => (
              <div key={dc.identityId} className="rounded-lg border border-line bg-bone-raised p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-ink">{dc.identityName}</p>
                    <p className="text-[11px] text-graphite">
                      {dc.channel} · {dc.allocationPct}% allocation
                    </p>
                  </div>
                  <StatusBadge
                    status={dc.dayCloseStatus === 'completed' ? 'Closed' : dc.dayCloseStatus === 'completed_with_exception' ? 'Exception' : dc.dayCloseStatus === 'missed' ? 'Missed' : 'Open'}
                    variant={dc.dayCloseStatus === 'completed' ? 'success' : dc.dayCloseStatus === 'completed_with_exception' ? 'info' : dc.dayCloseStatus === 'missed' ? 'danger' : 'neutral'}
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-graphite">Connections: </span>
                    <span className={dc.progress.connections.remaining === 0 ? 'text-status-success' : 'text-ink'}>
                      {dc.progress.connections.completed}/{dc.progress.connections.target}
                    </span>
                  </div>
                  <div>
                    <span className="text-graphite">DMs: </span>
                    <span className={dc.progress.firstDms.remaining === 0 ? 'text-status-success' : 'text-ink'}>
                      {dc.progress.firstDms.completed}/{dc.progress.firstDms.target}
                    </span>
                  </div>
                  <div>
                    <span className="text-graphite">Emails: </span>
                    <span className={dc.progress.emails.remaining === 0 ? 'text-status-success' : 'text-ink'}>
                      {dc.progress.emails.completed}/{dc.progress.emails.target}
                    </span>
                  </div>
                  <div>
                    <span className="text-graphite">Follow-ups: </span>
                    <span className={dc.progress.followups.remaining === 0 ? 'text-status-success' : 'text-ink'}>
                      {dc.progress.followups.completed}/{dc.progress.followups.target}
                    </span>
                  </div>
                </div>
                {dc.exceptionReason && (
                  <p className="mt-2 text-[11px] text-status-info">
                    Exception: {dc.exceptionReason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Exceptions */}
      {data.dayCloses?.some((dc) => dc.exceptionReason) && (
        <section className="space-y-3">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-status-warning">
            Exception Requests
          </p>
          <div className="space-y-2">
            {data.dayCloses?.filter((dc) => dc.exceptionReason).map((dc) => (
              <div key={dc.identityId} className="rounded-lg border border-status-warning/20 bg-status-warning/5 p-3">
                <p className="text-[13px] font-medium text-ink">{dc.identityName}</p>
                <p className="text-[12px] text-graphite">
                  Reason: {dc.exceptionReason}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
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
