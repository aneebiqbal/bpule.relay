'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Target, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from 'cn'

interface TodayData {
  isWorkingDay: boolean
  totalTarget: number
  totalCompleted: number
  totalRemaining: number
  overallStatus: 'on_track' | 'at_risk' | 'completed' | 'missed'
  identities: Array<{
    assignmentId: string
    identity: { identityName: string; channel: string }
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

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  completed: { bg: 'bg-status-success/10 border-status-success/20', text: 'text-status-success', label: 'On Target' },
  on_track: { bg: 'bg-cobalt/10 border-cobalt/20', text: 'text-cobalt', label: 'On Track' },
  at_risk: { bg: 'bg-status-warning/10 border-status-warning/20', text: 'text-status-warning', label: 'Behind' },
  missed: { bg: 'bg-status-danger/5 border-status-danger/20', text: 'text-status-danger', label: 'Missed' },
}



export function AccountabilityStrip() {
  const [data, setData] = useState<TodayData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/rep/today')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null
  if (!data || data.totalTarget === 0) return null

  const style = STATUS_STYLE[data.overallStatus] ?? STATUS_STYLE.on_track

  return (
    <section className="reveal-up stagger-2">
      <Link
        href="/rep/assigned-profiles"
        className={cn('group flex items-center gap-3 rounded-xl border p-4 transition-all hover:shadow-sm', style.bg)}
      >
        <div className="shrink-0">
          {data.overallStatus === 'completed' ? (
            <CheckCircle2 className={cn('size-5', style.text)} />
          ) : data.overallStatus === 'at_risk' ? (
            <AlertTriangle className={cn('size-5', style.text)} />
          ) : (
            <Target className={cn('size-5', style.text)} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">
              {data.totalCompleted} / {data.totalTarget} done today
            </span>
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', style.text, style.bg.split(' ')[0])}>
              {style.label}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1.5 flex-1 rounded-full bg-line/50 overflow-hidden max-w-xs">
              <div
                className={cn('h-full rounded-full transition-all',
                  data.overallStatus === 'completed' ? 'bg-status-success' :
                  data.overallStatus === 'at_risk' ? 'bg-status-warning' : 'bg-orange'
                )}
                style={{ width: `${Math.min(Math.round((data.totalCompleted / data.totalTarget) * 100), 100)}%` }}
              />
            </div>
            {data.totalRemaining > 0 && (
              <span className="text-xs text-slate">{data.totalRemaining} remaining</span>
            )}
          </div>
        </div>
        <ArrowRight className="size-4 text-slate transition-transform group-hover:translate-x-0.5" />
      </Link>
    </section>
  )
}
