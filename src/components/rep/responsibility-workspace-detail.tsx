'use client'

import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, CheckCircle2, MessageSquare, Clock, Target } from 'lucide-react'
import { cn } from 'cn'
import { Skeleton } from '@/components/ui/skeleton'

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

function activityLabel(t: string): string {
  const map: Record<string, string> = {
    dm: 'DMs',
    connection_request: 'Connections',
    followup: 'Follow-ups',
    application: 'Applications',
    proposal: 'Proposals',
    other: 'Other',
  }
  return map[t] ?? t
}

function channelIcon(channel: string): string {
  if (channel === 'linkedin') return 'in'
  if (channel === 'upwork') return 'U'
  return '•'
}

function channelColor(channel: string): string {
  if (channel === 'linkedin') return 'bg-[#0a66c2]/10 text-[#0a66c2]'
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

  const needsReply = leads.filter((l) => l.status === 'replied')
  const followUpsDue = leads.filter((l) => l.status === 'followed_up')
  const readyForOutreach = leads.filter((l) => l.status === 'new')
  const recentlyContacted = leads.filter((l) => l.status === 'contacted')

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

      <section className="rounded-lg border border-line bg-bone-raised p-4">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-stone" />
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
            Today
          </p>
        </div>
        <div className="mt-3 space-y-2.5">
          {targets.length > 0 ? (
            targets.map((target) => (
              <div key={target.targetId} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-ink">{activityLabel(target.activityType)}</span>
                    <span className="text-mono-medium text-[11px] text-graphite">
                      {target.completedCount} / {target.targetCount}
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line/60">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        target.completedCount >= target.targetCount
                          ? 'bg-status-success'
                          : target.status === 'at_risk'
                            ? 'bg-status-warning'
                            : 'bg-orange',
                      )}
                      style={{ width: `${Math.min(Math.round((target.completedCount / target.targetCount) * 100), 100)}%` }}
                    />
                  </div>
                </div>
                <span className={cn(
                  'shrink-0 text-[12px] font-medium',
                  target.remaining > 0 ? 'text-orange' : 'text-status-success',
                )}>
                  {target.remaining > 0 ? `${target.remaining} left` : <CheckCircle2 className="size-4" />}
                </span>
              </div>
            ))
          ) : (
            <p className="text-[12px] text-graphite">No activity targets assigned for today.</p>
          )}
        </div>
      </section>

      {(needsReply.length > 0 || followUpsDue.length > 0 || readyForOutreach.length > 0) && (
        <section className="space-y-3">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
            Active Work
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {needsReply.length > 0 && (
              <WorkSection
                icon={MessageSquare}
                title="Needs reply"
                items={needsReply}
                accent="orange"
              />
            )}
            {followUpsDue.length > 0 && (
              <WorkSection
                icon={Clock}
                title="Follow-ups due"
                items={followUpsDue}
                accent="warning"
              />
            )}
            {readyForOutreach.length > 0 && (
              <WorkSection
                icon={Target}
                title="Ready for outreach"
                items={readyForOutreach}
                accent="cobalt"
              />
            )}
            {recentlyContacted.length > 0 && (
              <WorkSection
                icon={CheckCircle2}
                title="Recently contacted"
                items={recentlyContacted}
                accent="success"
              />
            )}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          About This Profile
        </p>
        <div className="rounded-lg border border-line bg-bone-raised p-4">
          {identity.positioning && (
            <p className="text-[13px] text-ink">{identity.positioning}</p>
          )}
          {identity.expertise.length > 0 && (
            <div className="mt-3">
              <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Core expertise</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {identity.expertise.slice(0, 8).map((item) => (
                  <span key={item} className="rounded-full border border-line bg-bone px-2 py-0.5 text-[11px] text-graphite">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
          {identity.technologies.length > 0 && (
            <div className="mt-3">
              <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Technologies</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {identity.technologies.slice(0, 10).map((item) => (
                  <span key={item} className="rounded-full border border-line bg-bone px-2 py-0.5 text-[11px] text-graphite">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
          {identity.allowedFirstPersonClaims.length > 0 && (
            <div className="mt-3">
              <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Authorized claims</p>
              <ul className="mt-1.5 space-y-0.5">
                {identity.allowedFirstPersonClaims.slice(0, 5).map((claim) => (
                  <li key={claim} className="text-[12px] text-graphite">• {claim}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-[11px] text-stone">
              Need something changed? Contact your admin.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function WorkSection({
  icon: Icon,
  title,
  items,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  items: Array<{ id: string; company: string; contactName: string | null; status: string }>
  accent: 'orange' | 'warning' | 'cobalt' | 'success'
}) {
  const accentColor = accent === 'orange' ? 'text-orange' : accent === 'warning' ? 'text-status-warning' : accent === 'cobalt' ? 'text-cobalt' : 'text-status-success'

  return (
    <div className="rounded-lg border border-line bg-bone-raised p-3">
      <div className="flex items-center gap-2">
        <Icon className={cn('size-3.5', accentColor)} />
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">{title}</p>
        <span className="text-mono-medium text-[10px] text-graphite">{items.length}</span>
      </div>
      <div className="mt-2 space-y-0">
        {items.slice(0, 4).map((item) => (
          <Link
            key={item.id}
            href={`/leads/${item.id}`}
            className="flex items-baseline justify-between gap-2 py-1.5 hover:bg-bone -mx-1 px-1 rounded"
          >
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-ink">{item.company}</p>
              {item.contactName && (
                <p className="truncate text-[10px] text-graphite">{item.contactName}</p>
              )}
            </div>
          </Link>
        ))}
        {items.length > 4 && (
          <p className="text-[10px] text-stone pt-1">+{items.length - 4} more</p>
        )}
      </div>
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
