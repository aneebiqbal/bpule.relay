'use client'

import { use } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Target, Users, ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'

interface CommandCenterData {
  orgName: string
  teams: Array<{
    teamId: string
    teamName: string
    managers: Array<{ repId: string; repName: string; role: string }>
    members: Array<{
      repId: string
      repName: string
      role: string
      totalTarget: number
      totalCompleted: number
      totalRemaining: number
      attentionReason: string | null
    }>
    totalTarget: number
    totalCompleted: number
    totalRemaining: number
    needsAttention: number
  }>
  totalReps: number
  totalTarget: number
  totalCompleted: number
  totalRemaining: number
  totalNeedsAttention: number
  today: string
  isOwner: boolean
}

export function OwnerCommandCenter({ dataPromise }: { dataPromise: Promise<CommandCenterData> }) {
  const data = use(dataPromise)

  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
            Organization
          </p>
          <span className="size-1 rounded-full bg-line" />
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange">
            Command Center
          </p>
        </div>
        <h1 className="text-display text-[28px] font-light tracking-[-0.02em] text-ink sm:text-[32px]">
          {data.orgName}
        </h1>
        <p className="text-[13px] text-graphite">
          {new Date(data.today).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </header>

      <section className="rounded-lg border border-line bg-bone-raised p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded border border-line bg-bone px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-ststone">Teams</p>
            <p className="mt-0.5 text-[15px] font-medium text-ink">{data.teams.length}</p>
          </div>
          <div className="rounded border border-line bg-bone px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-ststone">People</p>
            <p className="mt-0.5 text-[15px] font-medium text-ink">{data.totalReps}</p>
          </div>
          <div className="rounded border border-line bg-bone px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-ststone">Remaining</p>
            <p className="mt-0.5 text-[15px] font-medium text-orange">{data.totalRemaining}</p>
          </div>
          <div className="rounded border border-line bg-bone px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-ststone">Attention</p>
            <p className="mt-0.5 text-[15px] font-medium text-status-warning">{data.totalNeedsAttention}</p>
          </div>
        </div>
      </section>

      {data.totalNeedsAttention > 0 && (
        <section className="rounded-lg border border-status-warning/20 bg-status-warning/5 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-status-warning" />
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-status-warning">
              Needs Attention
            </p>
          </div>
          <div className="mt-2 space-y-1">
            {data.teams.filter((t) => t.needsAttention > 0).map((team) => (
              <div key={team.teamId} className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-ink">{team.teamName}</span>
                <span className="text-[11px] text-graphite">{team.needsAttention} items</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-ststone">
          Teams
        </p>
        {data.teams.length === 0 ? (
          <p className="text-[13px] text-graphite">No teams configured.</p>
        ) : (
          <div className="space-y-2">
            {data.teams.map((team) => (
              <div key={team.teamId} className="rounded-lg border border-line bg-bone-raised p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="size-4 text-stone" />
                    <p className="text-[13px] font-medium text-ink">{team.teamName}</p>
                    <span className="text-[11px] text-graphite">{team.managers.length + team.members.length} people</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {team.needsAttention > 0 && (
                      <span className="rounded-full bg-status-warning/10 px-2 py-0.5 text-[10px] font-medium text-status-warning">
                        {team.needsAttention}
                      </span>
                    )}
                    <span className="text-[12px] font-medium text-orange">
                      {team.totalRemaining} remaining
                    </span>
                  </div>
                </div>

                {team.managers.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-ststone">Manager:</span>
                    {team.managers.map((m) => (
                      <span key={m.repId} className="text-[11px] text-graphite">{m.repName}</span>
                    ))}
                  </div>
                )}

                {team.members.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {team.members.slice(0, 3).map((m) => (
                      <div key={m.repId} className="flex items-center justify-between">
                        <span className="text-[11px] text-graphite">{m.repName}</span>
                        <div className="flex items-center gap-2">
                          {m.attentionReason && (
                            <span className="text-[10px] text-status-warning">{m.attentionReason}</span>
                          )}
                          <span className="text-[10px] text-stone">
                            {m.totalCompleted}/{m.totalTarget}
                          </span>
                        </div>
                      </div>
                    ))}
                    {team.members.length > 3 && (
                      <p className="text-[10px] text-stone">+{team.members.length - 3} more</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export function OwnerCommandCenterSkeleton() {
  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-3.5 w-48" />
      </header>
      <Skeleton className="h-24" />
      <div className="space-y-2">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  )
}
