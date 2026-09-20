import Link from 'next/link'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import { cn } from 'cn'
import { StatusBadge } from '@/components/ui/status-badge'
import type { AccountabilityStatus } from '@/lib/domain/types'

interface TargetView {
  targetId: string
  activityType: string
  targetCount: number
  completedCount: number
  remaining: number
  status: string
}

interface ResponsibilityCardProps {
  assignmentId: string
  revenueIdentityId: string
  identityName: string
  title: string | null
  channel: string
  targets: TargetView[]
  repliesWaiting?: number
  followUpsDue?: number
  isNew?: boolean
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

function statusVariant(status: AccountabilityStatus): 'success' | 'warning' | 'danger' | 'cobalt' {
  if (status === 'completed') return 'success'
  if (status === 'at_risk') return 'warning'
  if (status === 'missed') return 'danger'
  return 'cobalt'
}

function isTargetComplete(target: TargetView): boolean {
  return target.completedCount >= target.targetCount
}

export function ResponsibilityCard({
  revenueIdentityId,
  identityName,
  title,
  channel,
  targets,
  repliesWaiting = 0,
  followUpsDue = 0,
  isNew = false,
}: ResponsibilityCardProps) {
  const totalRemaining = targets.reduce((sum, t) => sum + t.remaining, 0)
  const allComplete = totalRemaining === 0 && repliesWaiting === 0 && followUpsDue === 0

  const worstStatus: AccountabilityStatus = allComplete
    ? 'completed'
    : targets.some((t) => t.status === 'missed')
      ? 'missed'
      : targets.some((t) => t.status === 'at_risk')
        ? 'at_risk'
        : 'on_track'

  const actionsRemaining = totalRemaining + repliesWaiting + followUpsDue

  return (
    <article className="overflow-hidden rounded-lg border border-line bg-bone-raised">
      {isNew && (
        <div className="border-b border-line bg-orange/5 px-4 py-1.5">
          <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-orange">
            New responsibility
          </p>
        </div>
      )}
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded text-xs font-medium',
          channelColor(channel),
        )}>
          {channelIcon(channel)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-ink">{identityName}</span>
            <span className="text-mono-medium text-[10px] uppercase tracking-wide text-stone">
              {channel}
            </span>
          </div>
          <p className="truncate text-xs text-graphite">{title || 'No title set'}</p>
        </div>
        <StatusBadge
          status={allComplete ? 'Complete' : worstStatus === 'on_track' ? 'On Track' : worstStatus === 'at_risk' ? 'At Risk' : worstStatus === 'missed' ? 'Missed' : 'On Track'}
          variant={statusVariant(worstStatus)}
        />
      </div>

      <div className="space-y-0 divide-y divide-line/50">
        {targets.map((target) => (
          <div key={target.targetId} className="flex items-center gap-3 px-4 py-3">
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
                    isTargetComplete(target)
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
        ))}
      </div>

      {(repliesWaiting > 0 || followUpsDue > 0) && (
        <div className="flex items-center gap-4 border-t border-line/60 px-4 py-2">
          {repliesWaiting > 0 && (
            <span className="text-[11px] text-graphite">
              <span className="font-medium text-ink">{repliesWaiting}</span> reply waiting
            </span>
          )}
          {followUpsDue > 0 && (
            <span className="text-[11px] text-graphite">
              <span className="font-medium text-ink">{followUpsDue}</span> follow-up due
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-line bg-bone/50 px-4 py-2.5">
        <span className={cn(
          'text-[12px] font-medium',
          allComplete ? 'text-status-success' : 'text-stone',
        )}>
          {allComplete
            ? 'All targets complete'
            : `${actionsRemaining} action${actionsRemaining === 1 ? '' : 's'} remaining`}
        </span>
        <Link
          href={`/workspace/${revenueIdentityId}`}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-ink hover:text-orange"
        >
          Open workspace
          <ArrowRight className="size-3" />
        </Link>
      </div>
    </article>
  )
}
