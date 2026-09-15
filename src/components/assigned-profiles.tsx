'use client'

import { useEffect, useState } from 'react'
import { Shield, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from 'cn'
import type { RepTodayView, TargetProgressView, ActivityType } from '@/lib/domain/types'

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'bg-status-success/10 text-status-success',
    on_track: 'bg-cobalt/10 text-cobalt',
    at_risk: 'bg-status-warning/10 text-status-warning',
    missed: 'bg-red-100 text-red-600',
  }
  const labels: Record<string, string> = {
    completed: 'Complete',
    on_track: 'On Track',
    at_risk: 'At Risk',
    missed: 'Missed',
  }
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', styles[status] ?? 'bg-stone/20 text-slate')}>
      {labels[status] ?? status}
    </span>
  )
}

function activityLabel(t: ActivityType): string {
  const map: Record<ActivityType, string> = { dm: 'DMs', connection_request: 'Connections', followup: 'Follow-ups', application: 'Applications', proposal: 'Proposals', other: 'Other' }
  return map[t] ?? t
}

export function AssignedProfilesView() {
  const [data, setData] = useState<RepTodayView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/rep/today')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm text-slate">Loading your assignments…</div>
  if (error) return <div className="text-sm text-red-500">{error}</div>
  if (!data) return null

  return (
    <div className="space-y-6">
      {/* Overall summary */}
      <div className="rounded-xl border border-line bg-bone-raised p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-ink">Today&apos;s Summary</h2>
          <StatusBadge status={data.overallStatus} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-label text-stone">Target</p>
            <p className="text-mono-medium text-xl font-medium text-ink">{data.totalTarget}</p>
          </div>
          <div>
            <p className="text-label text-stone">Completed</p>
            <p className="text-mono-medium text-xl font-medium text-ink">{data.totalCompleted}</p>
          </div>
          <div>
            <p className="text-label text-stone">Remaining</p>
            <p className={cn('text-mono-medium text-xl font-medium', data.totalRemaining > 0 ? 'text-orange' : 'text-status-success')}>
              {data.totalRemaining}
            </p>
          </div>
        </div>
      </div>

      {/* Per-identity breakdown */}
      {data.assignedIdentities.map((ai) => (
        <div key={ai.assignmentId} className="rounded-xl border border-line bg-bone-raised overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
            <div className={cn('flex size-9 items-center justify-center rounded-lg text-xs font-medium',
              ai.identity.channel === 'linkedin' ? 'bg-[#0a66c2]/10 text-[#0a66c2]' :
              ai.identity.channel === 'upwork' ? 'bg-[#14a800]/10 text-[#14a800]' : 'bg-graphite/10 text-graphite'
            )}>
              {ai.identity.channel === 'linkedin' ? 'in' : ai.identity.channel === 'upwork' ? 'U' : '•'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">{ai.identity.identityName}</span>
                <span className="text-xs text-slate">— {ai.identity.channel}</span>
              </div>
              <p className="text-xs text-slate">{ai.identity.title}</p>
            </div>
            {ai.identity.profileUrl && (
              <a href={ai.identity.profileUrl} target="_blank" rel="noopener" className="rounded p-1.5 text-slate hover:text-ink">
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
          {ai.targets.length > 0 ? (
            <div className="divide-y divide-line/50">
              {ai.targets.map((t: TargetProgressView) => (
                <div key={t.targetId} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink">{activityLabel(t.activityType)}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-mono-medium text-graphite">{t.completedCount} / {t.targetCount}</span>
                      <div className="h-1.5 flex-1 rounded-full bg-line overflow-hidden max-w-32">
                        <div
                          className={cn('h-full rounded-full',
                            t.status === 'completed' ? 'bg-status-success' :
                            t.status === 'at_risk' ? 'bg-status-warning' : 'bg-orange'
                          )}
                          style={{ width: `${Math.min(Math.round((t.completedCount / t.targetCount) * 100), 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <span className={cn('text-mono-medium text-sm font-medium',
                    t.remaining > 0 ? 'text-orange' : 'text-status-success'
                  )}>
                    {t.remaining > 0 ? `${t.remaining} left` : <CheckCircle2 className="size-4" />}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-3 text-xs text-slate">No targets set for this identity today.</div>
          )}
        </div>
      ))}

      {data.assignedIdentities.length === 0 && (
        <div className="rounded-xl border border-dashed border-line py-12 text-center">
          <Shield className="mx-auto size-8 text-slate mb-3" />
          <p className="text-sm font-medium text-ink mb-1">No profiles assigned</p>
          <p className="text-xs text-slate max-w-xs mx-auto">An admin hasn&apos;t assigned any revenue identities to you yet. Assigned identities will appear here with your daily targets.</p>
        </div>
      )}
    </div>
  )
}
