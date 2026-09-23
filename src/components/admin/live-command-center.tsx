'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts'
import { cn } from 'cn'
import { Activity, MessageSquare, Zap, Users, TrendingUp } from 'lucide-react'

type StreamItem = { id: string; eventType: string; label: string; actorName: string; occurredAt: string }
type PerRep = { id: string; name: string; connections: number; dms: number; followups: number; emails: number; replies: number; total: number }
type Funnel = { new: number; contacted: number; replied: number; followed_up: number; won: number; lost: number }
type Feed = {
  date: string
  generatedAt: string
  stream: StreamItem[]
  hourly: number[]
  perRep: PerRep[]
  funnel: Funnel
  totals: { outreach: number; replies: number; completed: number; events: number }
}

function relativeTime(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function hourLabel(h: number): string {
  if (h === 0) return '12a'
  if (h < 12) return `${h}a`
  if (h === 12) return '12p'
  return `${h - 12}p`
}

const FUNNEL_ORDER: Array<{ key: keyof Funnel; label: string; color: string }> = [
  { key: 'new', label: 'New', color: 'bg-orange' },
  { key: 'contacted', label: 'Contacted', color: 'bg-cobalt' },
  { key: 'followed_up', label: 'Followed up', color: 'bg-status-warning' },
  { key: 'replied', label: 'Replying', color: 'bg-status-success' },
  { key: 'won', label: 'Won', color: 'bg-status-success' },
]

export function LiveCommandCenter() {
  const [data, setData] = useState<Feed | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/live-feed')
      if (res.status === 403) { setError('Not authorized.'); return }
      if (!res.ok) { setError('Failed to load feed.'); return }
      const json = (await res.json()) as Feed
      setData(json)
      setError(null)
    } catch {
      setError('Failed to load feed.')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const initial = () => { if (!cancelled) load() }
    initial()
    const dataInterval = setInterval(() => { if (!cancelled) load() }, 15_000)
    const tickInterval = setInterval(() => { if (!cancelled) setNow(Date.now()) }, 15_000)
    window.addEventListener('focus', initial)
    return () => { cancelled = true; clearInterval(dataInterval); clearInterval(tickInterval); window.removeEventListener('focus', initial) }
  }, [load])

  if (error) {
    return <p className="rounded border border-status-warning/20 bg-status-warning/5 px-3 py-2 text-[12px] text-status-warning">{error}</p>
  }

  if (!data) {
    return <div className="h-64 animate-pulse rounded-xl border border-line bg-bone-raised" />
  }

  const hourlyData = data.hourly.map((count, h) => ({ hour: hourLabel(h), h, count }))
  const maxFunnel = Math.max(1, ...FUNNEL_ORDER.map((f) => data.funnel[f.key]))

  return (
    <div className="space-y-5">
      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={<Activity className="size-4" />} label="Outreach today" value={String(data.totals.outreach)} />
        <StatTile icon={<MessageSquare className="size-4" />} label="Replies today" value={String(data.totals.replies)} />
        <StatTile icon={<Zap className="size-4" />} label="Actions done" value={String(data.totals.completed)} />
        <StatTile icon={<TrendingUp className="size-4" />} label="Events" value={String(data.totals.events)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Activity stream — 3 cols */}
        <div className="lg:col-span-3 rounded-2xl border border-line/60 bg-bone-raised p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-graphite">
              <Activity className="size-3.5" />
              <span className="text-label">Live activity</span>
            </div>
            <span className="text-[10px] text-stone">updated {relativeTime(data.generatedAt, now)}</span>
          </div>
          <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {data.stream.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-graphite">No activity yet today.</p>
            ) : (
              data.stream.slice(0, 30).map((item) => (
                <div key={item.id} className="flex items-baseline gap-2 text-[12px]">
                  <span className="shrink-0 text-mono-medium text-stone text-[10px] w-10 text-right">{relativeTime(item.occurredAt, now)}</span>
                  <span className="text-ink">
                    <span className="font-medium">{item.actorName}</span> {item.label}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Funnel — 2 cols */}
        <div className="lg:col-span-2 rounded-2xl border border-line/60 bg-bone-raised p-4">
          <div className="flex items-center gap-2 text-graphite">
            <Users className="size-3.5" />
            <span className="text-label">Pipeline</span>
          </div>
          <div className="mt-3 space-y-2">
            {FUNNEL_ORDER.map((f) => {
              const value = data.funnel[f.key]
              const pct = Math.round((value / maxFunnel) * 100)
              return (
                <div key={f.key}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-graphite">{f.label}</span>
                    <span className="text-mono-medium text-ink">{value}</span>
                  </div>
                  <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-bone">
                    <div className={cn('h-full rounded-full transition-all duration-500', f.color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Hourly activity chart */}
      <div className="rounded-2xl border border-line/60 bg-bone-raised p-4">
        <p className="text-label text-graphite">Team activity by hour</p>
        <div className="mt-2 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: 'var(--stone)' }} interval={2} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--stone)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bone-raised)' }}
                formatter={(value) => [`${value} events`, 'Activity']}
                labelFormatter={(label) => `${label}`}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {hourlyData.map((entry) => (
                  <Cell key={entry.h} fill={entry.count > 0 ? 'var(--orange)' : 'var(--line)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {data.perRep.length > 0 && (
        <div className="rounded-2xl border border-line/60 bg-bone-raised p-4">
          <p className="text-label text-graphite">Who sent what today</p>
          <div className="mt-2" style={{ height: Math.max(180, data.perRep.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.perRep}
                layout="vertical"
                margin={{ top: 4, right: 28, bottom: 0, left: 4 }}
              >
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="id"
                  width={132}
                  axisLine={false}
                  tickLine={false}
                  tick={(props: { x: number; y: number; payload: { value: string } }) => {
                    const row = data.perRep.find((rep) => rep.id === props.payload.value)
                    return (
                      <text x={props.x} y={props.y} dy={4} textAnchor="end" fill="var(--ink)" fontSize={11}>
                        {row?.name ?? ''}
                        <tspan fill="var(--graphite)"> {row?.total ?? 0}</tspan>
                      </text>
                    )
                  }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bone-raised)' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="connections" stackId="sent" name="Connections" fill="var(--cobalt)" />
                <Bar dataKey="dms" stackId="sent" name="First DMs" fill="var(--orange)" />
                <Bar dataKey="followups" stackId="sent" name="Follow-ups" fill="var(--status-warning)" />
                <Bar dataKey="emails" stackId="sent" name="Emails" fill="var(--status-success)" />
                <Bar dataKey="replies" stackId="sent" name="Replies" fill="var(--status-info)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/60 bg-bone-raised p-3">
      <div className="flex items-center gap-1.5 text-graphite">
        {icon}
        <span className="text-label">{label}</span>
      </div>
      <p className="mt-1 text-mono-medium text-2xl font-medium text-ink">{value}</p>
    </div>
  )
}
