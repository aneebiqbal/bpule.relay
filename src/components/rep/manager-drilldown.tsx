'use client'

import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { DailyJobs, jobsFromTargets } from '@/components/rep/daily-jobs'

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

  const workingDay = ![0, 6].includes(new Date().getDay())
  const jobs = jobsFromTargets(data.targets.map((row) => ({ targets: row.targets })))
  const exceptions = (data.dayCloses ?? []).filter((row) => row.exceptionReason)

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
            {data.rep.role} · {data.identities.map((identity) => identity.identityName).join(', ') || 'No profile'}
          </p>
        </div>
      </header>

      <DailyJobs jobs={jobs} workingDay={workingDay} />

      {exceptions.length > 0 && (
        <p className="rounded-lg border border-status-warning/30 bg-status-warning/10 px-4 py-3 text-[13px] text-ink">
          Exception asked: {exceptions.map((row) => `${row.identityName} (${row.exceptionReason})`).join('. ')}
        </p>
      )}

      <section className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Open people</p>
        <OpenWork leads={data.openLeads ?? []} />
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
