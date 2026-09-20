import { AlertTriangle, Shield } from 'lucide-react'
import { YourDaySummary } from './your-day-summary'
import { ResponsibilityCard } from './responsibility-card'
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
}

interface RepWorkspaceProps {
  data: RepWorkspaceData
}

export function RepWorkspace({ data }: RepWorkspaceProps) {
  if (!data.hasAssignments) {
    return <NoAssignmentsState repName={data.rep.name} />
  }

  return (
    <div className="space-y-6 pb-8">
      <YourDaySummary
        repName={data.rep.name}
        totalRemaining={data.day.totalRemaining}
        repliesWaiting={data.day.repliesWaiting}
        followUpsDue={data.day.followUpsDue}
        outreachRemaining={data.day.outreachRemaining}
        isComplete={data.day.isComplete}
        isWorkingDay={data.isWorkingDay}
        identityCount={data.identities.length}
      />

      {data.notifications.length > 0 && (
        <section className="rounded-lg border border-orange/20 bg-orange/5 px-4 py-3">
          <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
            <AlertTriangle className="size-3.5 text-orange" />
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

      <DoThisNext action={data.nextAction} />

      <section className="space-y-3">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Your Responsibilities
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.identities.map((identity) => (
            <ResponsibilityCard
              key={identity.assignmentId}
              {...identity}
              repliesWaiting={identity.targets.some((t) => t.activityType === 'dm') ? 0 : 0}
              followUpsDue={identity.targets.some((t) => t.activityType === 'followup') ? 0 : 0}
            />
          ))}
        </div>
      </section>

      <UpNext
        actions={data.upNext}
        excludeId={data.nextAction?.id}
      />

      <section className="space-y-2">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Today&apos;s Targets
        </p>
        <div className="overflow-hidden rounded-lg border border-line bg-bone-raised">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line bg-bone text-left text-mono-medium text-[10px] uppercase tracking-wide text-stone">
                <th className="px-3 py-2">Profile</th>
                <th className="px-3 py-2">Activity</th>
                <th className="px-3 py-2">Progress</th>
                <th className="px-3 py-2 text-right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {data.targetSummary.byIdentity.flatMap((identity) =>
                identity.targets.map((target) => (
                  <tr key={target.targetId} className="border-b border-line/60 last:border-b-0">
                    <td className="px-3 py-2 font-medium text-ink">{identity.identityName}</td>
                    <td className="px-3 py-2 text-graphite">{target.activityType}</td>
                    <td className="px-3 py-2 text-graphite">
                      {target.completedCount} / {target.targetCount}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-orange">
                      {target.remaining > 0 ? target.targetCount - target.completedCount : '—'}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>
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
