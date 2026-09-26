'use client'

import Link from 'next/link'
import { AlertTriangle, Shield } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { DailyJobs, jobsFromTargets } from './daily-jobs'
import { DoThisNext } from './do-this-next'
import { UpNext } from './up-next'
import { Skeleton } from '@/components/ui/skeleton'
import type { RelayTodayAction } from '@/components/relay-today-workspace'

export interface RepWorkspaceData {
  rep: { id: string; name: string }
  isWorkingDay: boolean
  hasAssignments: boolean
  identities: Array<{
    assignmentId: string
    revenueIdentityId: string
    identityName: string
    title: string | null
    channel: string
    targets: Array<{
      targetId: string
      activityType: string
      targetCount: number
      completedCount: number
      remaining: number
      status: string
    }>
  }>
  targetSummary: {
    totalTarget: number
    totalCompleted: number
    totalRemaining: number
    overallStatus: 'on_track' | 'at_risk' | 'completed' | 'missed'
    byIdentity: Array<{
      assignmentId: string
      revenueIdentityId: string
      identityName: string
      title: string | null
      channel: string
      targets: Array<{
        targetId: string
        activityType: string
        targetCount: number
        completedCount: number
        remaining: number
        status: string
      }>
    }>
  }
  day: {
    totalRemaining: number
    repliesWaiting: number
    followUpsDue: number
    outreachRemaining: number
    isComplete: boolean
  }
  nextAction: RelayTodayAction | null
  upNext: RelayTodayAction[]
  notifications: Array<{ id: string; title: string; body: string }>
  profilesPulled?: number
  isManager?: boolean
  teamName?: string
  teamMembers?: any[]
}

interface RepWorkspaceProps {
  data: RepWorkspaceData
  mode?: 'rep' | 'manager'
  teamData?: {
    teams: Array<{
      teamId: string
      teamName: string
      memberCount: number
      totalTarget: number
      totalCompleted: number
      totalRemaining: number
      needsAttention: number
      members: Array<{
        repId: string
        repName: string
        role: string
        revenueIdentities: Array<{
          identityName: string
          channel: string
          targets: Array<{
            activityType: string
            targetCount: number
            completedCount: number
            remaining: number
            status: string
          }>
        }>
        totalTarget: number
        totalCompleted: number
        totalRemaining: number
        attentionReason: string | null
      }>
    }>
    isOwner: boolean
  }
}

export function RepWorkspace({ data, teamData, mode = 'rep' }: RepWorkspaceProps) {
  const members = teamData?.teams.flatMap((team) => team.members) ?? []

  if (!data.hasAssignments && mode !== 'manager') {
    return <NoAssignmentsState repName={data.rep.name} />
  }

  return (
    <div className="space-y-6 pb-8">
      {mode === 'manager' && members.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-line bg-bone-raised">
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Team</p>
            <p className="mt-1 text-[14px] text-graphite">Who has not covered their numbers.</p>
          </div>
          <ul className="divide-y divide-line/70 border-t border-line">
            {[...members].sort((a, b) => b.totalRemaining - a.totalRemaining).map((member) => {
              const won = member.totalTarget > 0 && member.totalRemaining === 0
              return (
                <li key={member.repId}>
                  <Link href={`/team/${member.repId}`} className="block px-4 py-3 hover:bg-bone">
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-[14px] font-medium text-ink">{member.repName}</span>
                      <span className={won ? 'text-[13px] font-medium text-status-success' : 'text-[13px] text-ink'}>
                        {won ? 'Day won' : `${member.totalCompleted} of ${member.totalTarget}`}
                      </span>
                    </span>
                    <Progress
                      className="mt-1.5"
                      value={member.totalCompleted}
                      max={member.totalTarget > 0 ? member.totalTarget : 1}
                      size="md"
                      variant={won ? 'success' : 'default'}
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {data.hasAssignments && (
        <>
          <DoThisNext action={data.nextAction} />

          {data.notifications.length > 0 && (
            <section className="rounded-lg border border-line bg-bone-raised px-4 py-3">
              <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
                <AlertTriangle className="size-3.5 text-stone" />
                Recent signals
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {data.notifications.slice(0, 3).map((note) => (
                  <li key={note.id} className="text-[12px] text-graphite">
                    {note.title}: {note.body}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <DailyJobs
            jobs={jobsFromTargets(data.identities)}
            workingDay={data.isWorkingDay}
            profilesPulled={data.profilesPulled ?? 0}
          />

          <UpNext
            actions={data.upNext}
            excludeId={data.nextAction?.id}
          />

          <section className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Working as</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.identities.map((identity) => {
                const left = identity.targets.reduce((sum, target) => sum + target.remaining, 0)
                return (
                  <Link
                    key={identity.assignmentId}
                    href={`/workspace/${identity.revenueIdentityId}`}
                    className="flex items-center justify-between rounded-lg border border-line bg-bone-raised px-3 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-ink">{identity.identityName}</span>
                      <span className="text-[12px] text-graphite">{identity.channel} · {identity.title || 'No title'}</span>
                    </span>
                    <span className="shrink-0 text-[12px] font-medium text-ink">{left === 0 ? 'Covered' : `${left} left`}</span>
                  </Link>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function NoAssignmentsState({ repName }: { repName: string }) {
  return (
    <div className="space-y-6 pb-8">
      <section className="rounded-lg border border-line bg-bone-raised p-5">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Your Day
        </p>
        <h2 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">
          Good day, {repName}
        </h2>
      </section>
      <section className="rounded-lg border border-dashed border-line bg-bone-raised/40 px-6 py-12 text-center">
        <Shield className="mx-auto size-8 text-stone" />
        <p className="mt-3 text-[14px] font-medium text-ink">No work profile assigned yet</p>
        <p className="mt-1 max-w-xs mx-auto text-[13px] text-graphite">
          Your admin needs to assign a Revenue Identity before you can start revenue work.
          You don&apos;t need to do anything yet.
        </p>
      </section>
    </div>
  )
}

export function RepWorkspaceSkeleton() {
  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-lg border border-line bg-bone-raised p-5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-3 h-7 w-64" />
        <Skeleton className="mt-4 h-10 w-48" />
      </div>
      <div className="rounded-lg border border-orange/30 bg-orange/[0.03] p-5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-6 w-72" />
        <Skeleton className="mt-4 h-9 w-32" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </div>
  )
}
