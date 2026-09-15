'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Target, Users, Zap, Shield } from 'lucide-react'
import { cn } from 'cn'
import type { CommandCenterView, AttentionItem } from '@/lib/domain/types'

function StatCard({ label, value, sub, icon: Icon, tone }: { label: string; value: string | number; sub?: string; icon: React.ComponentType<{ className?: string }>; tone?: 'good' | 'warn' | 'bad' | 'neutral' }) {
  return (
    <div className="rounded-xl border border-line bg-bone-raised p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('size-4',
          tone === 'good' ? 'text-status-success' :
          tone === 'warn' ? 'text-status-warning' :
          tone === 'bad' ? 'text-red-500' : 'text-slate'
        )} />
        <span className="text-label text-stone">{label}</span>
      </div>
      <p className="text-mono-medium text-2xl font-medium text-ink">{value}</p>
      {sub && <p className="text-xs text-slate mt-0.5">{sub}</p>}
    </div>
  )
}

export function CommandCenter() {
  const [data, setData] = useState<CommandCenterView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/command-center')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm text-slate">Loading command center…</div>
  if (error) return <div className="text-sm text-red-500">{error}</div>
  if (!data) return null

  return (
    <div className="space-y-6">
      {/* Attention items */}
      {data.attentionItems.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-label text-stone">Requires Attention</h2>
          {data.attentionItems.map((item: AttentionItem, i: number) => (
            <div key={i} className={cn('flex items-center gap-3 rounded-xl border px-4 py-3',
              item.severity === 'critical' ? 'border-red-200 bg-red-50/50' : 'border-status-warning/20 bg-status-warning/5'
            )}>
              <AlertTriangle className={cn('size-4 shrink-0', item.severity === 'critical' ? 'text-red-500' : 'text-status-warning')} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">{item.repName} · {item.identityName}</p>
                <p className="text-xs text-graphite">{item.message}</p>
              </div>
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium',
                item.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-status-warning/10 text-status-warning'
              )}>{item.severity === 'critical' ? 'CRITICAL' : 'WARNING'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Team" value={data.totalReps} icon={Users} tone="neutral" />
        <StatCard label="On Track" value={data.onTrackReps} icon={CheckCircle2} tone="good" />
        <StatCard label="Behind" value={data.behindReps} icon={Clock} tone={data.behindReps > 0 ? 'warn' : 'good'} />
        <StatCard label="Completed" value={data.completedReps} icon={Target} tone="good" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Active Identities" value={data.activeIdentities} icon={Shield} />
        <StatCard label="Total Targets Today" value={data.totalTargetsToday} icon={Zap} />
        <StatCard label="Completed Today" value={data.totalCompletedToday} sub={data.totalTargetsToday > 0 ? `${Math.round((data.totalCompletedToday / data.totalTargetsToday) * 100)}%` : undefined} icon={Target} tone="good" />
      </div>

      {/* Identity performance */}
      <div>
        <h2 className="text-label text-stone mb-2">Identity Performance</h2>
        <div className="rounded-xl border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-bone-raised">
                <th className="px-3 py-2 text-left text-label text-stone">Identity</th>
                <th className="px-3 py-2 text-left text-label text-stone">Channel</th>
                <th className="px-3 py-2 text-right text-label text-stone">Target</th>
                <th className="px-3 py-2 text-right text-label text-stone">Done</th>
                <th className="px-3 py-2 text-right text-label text-stone">Progress</th>
              </tr>
            </thead>
            <tbody>
              {data.identityPerformance.map((ip) => {
                const pct = ip.totalTarget > 0 ? Math.round((ip.totalCompleted / ip.totalTarget) * 100) : 0
                return (
                  <tr key={ip.identityId} className="border-b border-line/50">
                    <td className="px-3 py-2 font-medium text-ink">{ip.identityName}</td>
                    <td className="px-3 py-2">
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium',
                        ip.channel === 'linkedin' ? 'bg-[#0a66c2]/10 text-[#0a66c2]' :
                        ip.channel === 'upwork' ? 'bg-[#14a800]/10 text-[#14a800]' : 'bg-graphite/10 text-graphite'
                      )}>{ip.channel}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-mono-medium text-graphite">{ip.totalTarget}</td>
                    <td className="px-3 py-2 text-right text-mono-medium text-ink">{ip.totalCompleted}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-line overflow-hidden">
                          <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-status-success' : pct >= 50 ? 'bg-orange' : 'bg-status-warning')} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-xs text-mono-medium text-slate w-8 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {data.identityPerformance.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate">No active identities with targets today.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Consecutive misses */}
      {data.consecutiveMisses.length > 0 && (
        <div>
          <h2 className="text-label text-stone mb-2">Consecutive Misses</h2>
          <div className="space-y-1">
            {data.consecutiveMisses.map((cm, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50/50 px-3 py-2">
                <AlertTriangle className="size-4 text-red-500" />
                <span className="text-sm text-ink">{cm.repName} missed {cm.streakDays} day{cm.streakDays !== 1 ? 's' : ''} on {cm.identityName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
