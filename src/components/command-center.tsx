'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { cn } from 'cn'

interface CommandCenterData {
  date: string
  totalReps: number
  onTrackReps: number
  behindReps: number
  completedReps: number
  activeIdentities: number
  totalTargetsToday: number
  totalCompletedToday: number
  attentionItems: Array<{
    repId: string
    repName: string
    identityId: string
    identityName: string
    activityType: string
    message: string
    severity: 'warning' | 'critical'
  }>
  repSummaries: Array<{
    repId: string
    repName: string
    totalTarget: number
    totalCompleted: number
    remaining: number
    status: 'on_track' | 'at_risk' | 'completed' | 'missed'
  }>
}

export function CommandCenter() {
  const [data, setData] = useState<CommandCenterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/command-center')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Failed to load command center.'))))
      .then((payload) => setData(payload))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load command center.'))
      .finally(() => setLoading(false))
  }, [])

  const teamRows = useMemo(
    () => (data?.repSummaries ?? []).slice().sort((a, b) => b.remaining - a.remaining),
    [data],
  )

  if (loading) {
    return <p className="text-[13px] text-graphite">Loading founder command surface...</p>
  }

  if (error) {
    return <p className="text-[13px] text-status-danger">{error}</p>
  }

  if (!data) return null

  const needsYou = data.attentionItems.slice(0, 5)
  const activeConversationsGuess = data.totalCompletedToday
  const highIntentGuess = data.attentionItems.filter((item) => item.activityType === 'reply').length

  return (
    <div className="space-y-5">
      <section className="rounded border border-line bg-bone-raised px-4 py-4">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Founder command / today</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric title="Attention" value={String(data.attentionItems.length).padStart(2, '0')} tone={data.attentionItems.length > 0 ? 'warn' : 'good'} />
          <Metric title="Team" value={`${data.onTrackReps + data.completedReps} / ${data.totalReps} on track`} tone="good" />
          <Metric title="Active conversations" value={String(activeConversationsGuess)} tone="neutral" />
          <Metric title="High-intent" value={String(highIntentGuess)} tone="warn" />
        </div>
      </section>

      <section className="rounded border border-line bg-bone-raised px-4 py-4">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Needs you</p>
        {needsYou.length > 0 ? (
          <div className="mt-3 space-y-2">
            {needsYou.map((item) => (
              <div
                key={`${item.repId}-${item.identityId}-${item.activityType}`}
                className={cn(
                  'rounded border px-3 py-2',
                  item.severity === 'critical'
                    ? 'border-status-danger/30 bg-status-danger/5'
                    : 'border-status-warning/30 bg-status-warning/5',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-medium text-ink">{item.repName} · {item.identityName}</p>
                    <p className="text-[12px] text-graphite">{item.message}</p>
                  </div>
                  <span className={cn(
                    'rounded px-1.5 py-0.5 text-mono-medium text-[10px] uppercase tracking-[0.12em]',
                    item.severity === 'critical'
                      ? 'bg-status-danger/15 text-status-danger'
                      : 'bg-status-warning/15 text-status-warning',
                  )}>
                    {item.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[12px] text-graphite">No exceptions right now. Team execution is stable.</p>
        )}
      </section>

      <section className="rounded border border-line bg-bone-raised px-4 py-4">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Team accountability</p>
        {teamRows.length > 0 ? (
          <div className="mt-3 space-y-2">
            {teamRows.map((row) => {
              const pct = row.totalTarget > 0 ? Math.round((row.totalCompleted / row.totalTarget) * 100) : 0
              return (
                <div key={row.repId} className="rounded border border-line/70 bg-bone px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-medium text-ink">{row.repName}</p>
                    <Status status={row.status} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[12px] text-graphite">
                    <span>{row.totalCompleted} / {row.totalTarget}</span>
                    <span>{row.remaining > 0 ? `${row.remaining} remaining` : 'Complete'}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded bg-line/60">
                    <div
                      className={cn(
                        'h-full rounded transition-all',
                        row.status === 'completed'
                          ? 'bg-status-success'
                          : row.status === 'at_risk' || row.status === 'missed'
                            ? 'bg-status-warning'
                            : 'bg-orange',
                      )}
                      style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="mt-3 text-[12px] text-graphite">No active team targets configured today.</p>
        )}
      </section>

      <Link href="/admin/targets" className="inline-flex items-center gap-1 text-[12px] font-medium text-ink">
        Manage targets
        <ArrowRight className="size-3" />
      </Link>
    </div>
  )
}

function Metric({ title, value, tone }: { title: string; value: string; tone: 'good' | 'warn' | 'neutral' }) {
  return (
    <div className={cn(
      'rounded border px-2.5 py-2',
      tone === 'good'
        ? 'border-status-success/30 bg-status-success/5'
        : tone === 'warn'
          ? 'border-status-warning/30 bg-status-warning/5'
          : 'border-line bg-bone',
    )}>
      <p className="text-mono-medium text-[9px] uppercase tracking-[0.12em] text-stone">{title}</p>
      <p className="mt-1 text-[13px] font-medium text-ink">{value}</p>
    </div>
  )
}

function Status({ status }: { status: CommandCenterData['repSummaries'][number]['status'] }) {
  if (status === 'completed') {
    return <CheckCircle2 className="size-4 text-status-success" />
  }
  if (status === 'at_risk' || status === 'missed') {
    return <AlertTriangle className="size-4 text-status-warning" />
  }
  return <span className="text-mono-medium text-[10px] uppercase tracking-[0.12em] text-stone">On track</span>
}
