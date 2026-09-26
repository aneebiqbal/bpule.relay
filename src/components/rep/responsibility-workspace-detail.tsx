'use client'

import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { cn } from 'cn'
import { Skeleton } from '@/components/ui/skeleton'
import { DailyJobs, jobsFromTargets } from '@/components/rep/daily-jobs'

interface TargetView {
  targetId: string
  activityType: string
  targetCount: number
  completedCount: number
  remaining: number
  status: string
}

interface WorkspaceDetailData {
  identity: {
    id: string
    identityName: string
    title: string | null
    channel: string
    positioning: string | null
    skills: string[]
    expertise: string[]
    industries: string[]
    technologies: string[]
    allowedFirstPersonClaims: string[]
    profileId: string | null
    profileUrl: string | null
  }
  targets: TargetView[]
  leads: Array<{
    id: string
    company: string
    contactName: string | null
    status: string
    createdAt: string
  }>
  today: string
}

function channelIcon(channel: string): string {
  if (channel === 'linkedin') return 'in'
  if (channel === 'email') return '@'
  if (channel === 'upwork') return 'U'
  return '•'
}

function channelColor(channel: string): string {
  if (channel === 'linkedin') return 'bg-[#0a66c2]/10 text-[#0a66c2]'
  if (channel === 'email') return 'bg-[#d97706]/10 text-[#d97706]'
  if (channel === 'upwork') return 'bg-[#14a800]/10 text-[#14a800]'
  return 'bg-graphite/10 text-graphite'
}

export function ResponsibilityWorkspaceDetail({
  dataPromise,
}: {
  dataPromise: Promise<WorkspaceDetailData>
}) {
  const data = use(dataPromise)
  const { identity, targets, leads } = data

  const workingDay = ![0, 6].includes(new Date().getDay())
  const leadOrder = ['replied', 'followed_up', 'new', 'contacted']
  const leadLabel: Record<string, string> = {
    replied: 'Reply',
    followed_up: 'Follow up',
    new: 'Send',
    contacted: 'Waiting',
  }
  const orderedLeads = [...leads].sort((a, b) => leadOrder.indexOf(a.status) - leadOrder.indexOf(b.status))

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
          Responsibility Workspace
        </p>
      </div>

      <header className="flex items-start gap-4">
        <div className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-lg text-sm font-medium',
          channelColor(identity.channel),
        )}>
          {channelIcon(identity.channel)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-light tracking-[-0.02em] text-ink">
            {identity.identityName}
          </h1>
          <p className="text-[13px] text-graphite">
            {identity.title || 'No title set'} · {identity.channel.toUpperCase()}
          </p>
          <p className="mt-0.5 text-[11px] text-stone">Assigned to you</p>
          {identity.profileUrl && (
            <a
              href={identity.profileUrl}
              target="_blank"
              rel="noopener"
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-graphite hover:text-ink"
            >
              View profile <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </header>

      <DailyJobs jobs={jobsFromTargets([{ targets }])} workingDay={workingDay} />

      <section className="overflow-hidden rounded-lg border border-line bg-bone-raised">
        <div className="px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">People to work</p>
          <p className="mt-1 text-[13px] text-graphite">Reply first, then follow up, then send.</p>
        </div>
        {orderedLeads.length === 0 ? (
          <p className="border-t border-line px-4 py-4 text-[13px] text-graphite">No open people on this profile. Pull more.</p>
        ) : (
          <ul className="divide-y divide-line/70 border-t border-line">
            {orderedLeads.slice(0, 12).map((lead) => (
              <li key={lead.id}>
                <Link href={`/leads/${lead.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-bone">
                  <span className="min-w-0 truncate text-[14px] text-ink">
                    {lead.company}
                    {lead.contactName ? <span className="text-graphite"> · {lead.contactName}</span> : null}
                  </span>
                  <span className="shrink-0 text-[12px] font-medium text-orange">{leadLabel[lead.status] ?? lead.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export function ResponsibilityWorkspaceSkeleton() {
  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="flex items-start gap-4">
        <Skeleton className="size-12 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Skeleton className="h-32" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  )
}
