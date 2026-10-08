'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, Shield } from 'lucide-react'
import { trackEvent } from '@/lib/analytics/tracker'
import { Progress } from '@/components/ui/progress'
import { DailyJobs, jobsFromTargets } from './daily-jobs'
import { DoThisNext } from './do-this-next'
import { UpNext } from './up-next'
import { BdDailyDesk } from './bd-daily-desk'
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
  referredLeads?: Array<{ id: string; company: string; score: number | null; canonicalScore: number | null; referredAt: string | null }>
  recentLeads?: Array<{ id: string; company: string; score: number | null; canonicalScore: number | null; createdAt: string }>
  upworkJobs?: Array<{ id: string; title: string; company: string; canonicalScore: number | null; fitScore: number | null }>
  completion?: { done: number; remaining: number }
  resumeWork?: Array<{ id: string; company: string; contactName: string | null; lastAction: string; state: string }>
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
  // Track home opened
  useEffect(() => {
    if (mode === 'rep') {
      trackEvent({ event: 'home_opened' })
    }
  }, [mode])

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
          {/* Daily completion context */}
          {data.completion && data.completion.done + data.completion.remaining > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-line bg-bone-raised px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-ink">
                  {data.completion.remaining === 0
                    ? 'Day complete — nothing left'
                    : `${data.completion.remaining} action${data.completion.remaining === 1 ? '' : 's'} left today`}
                </p>
                <p className="text-[11px] text-graphite">{data.completion.done} done</p>
              </div>
              <div className="h-2 w-20 overflow-hidden rounded-full bg-line/60">
                <div
                  className="h-full rounded-full bg-orange transition-all duration-500"
                  style={{ width: `${data.completion.done + data.completion.remaining > 0 ? Math.round((data.completion.done / (data.completion.done + data.completion.remaining)) * 100) : 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Resume Work — continue where you left off */}
          {data.resumeWork && data.resumeWork.length > 0 && (
            <section className="rounded-lg border border-orange/20 bg-orange/[0.02] p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone mb-2">Continue where you left off</p>
              <div className="space-y-1.5">
                {data.resumeWork.map((item) => (
                  <Link
                    key={item.id}
                    href={`/leads/${item.id}`}
                    className="flex items-center gap-3 rounded-lg border border-line/60 bg-bone-raised/60 px-3 py-2.5 transition-colors hover:border-orange/30 hover:bg-bone"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink truncate">{item.company}{item.contactName ? ` · ${item.contactName}` : ''}</p>
                      <p className="text-[11px] text-graphite">{item.state}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-orange">Continue →</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <DoThisNext action={data.nextAction} />

          <BdDailyDesk
            yourMove={data.upNext.filter(a => ['reply_needed', 'followup_due', 'connection_dm_due', 'high_fit_lead', 'new_opportunity', 'inbound_opportunity'].includes(a.kind))}
            theirMove={data.upNext.filter(a => ['lead_going_cold', 'proposal_ready'].includes(a.kind))}
            repliesWaiting={data.day.repliesWaiting}
            followUpsDue={data.day.followUpsDue}
            referredLeads={data.referredLeads ?? []}
            recentLeads={data.recentLeads ?? []}
            hasAnyWork={(data.upNext?.length > 0) || (data.referredLeads && data.referredLeads.length > 0) || (data.day.repliesWaiting > 0) || (data.day.followUpsDue > 0)}
          />

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

          {/* Upwork opportunities */}
          {data.upworkJobs && data.upworkJobs.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Upwork</p>
                <Link href="/upwork" className="text-[11px] text-graphite hover:text-ink">View all →</Link>
              </div>
              <div className="space-y-1">
                {data.upworkJobs.slice(0, 3).map((job) => (
                  <Link
                    key={job.id}
                    href={`/upwork/${job.id}`}
                    className="flex items-center justify-between rounded-lg border border-line bg-bone-raised/40 px-3 py-2.5 transition-colors hover:bg-bone"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{job.title}</p>
                      <p className="truncate text-[11px] text-graphite">{job.company}</p>
                    </div>
                    {job.fitScore != null && (
                      <span className="shrink-0 text-[11px] font-mono text-orange">{Math.round(job.fitScore)}% fit</span>
                    )}
                  </Link>
                ))}
              </div>
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
