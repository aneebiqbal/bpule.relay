'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, MessageSquare, Zap } from 'lucide-react'

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

  const quiet = data.perRep.filter((rep) => rep.total === 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatTile icon={<Activity className="size-4" />} label="Sent today" value={String(data.totals.outreach)} />
        <StatTile icon={<MessageSquare className="size-4" />} label="Replies" value={String(data.totals.replies)} />
        <StatTile icon={<Zap className="size-4" />} label="Actions done" value={String(data.totals.completed)} />
      </div>

      <section className="overflow-hidden rounded-lg border border-line bg-bone-raised">
        <div className="px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Who sent what</p>
          <p className="mt-1 text-[13px] text-graphite">Notes, first messages, follow-ups, and replies.</p>
        </div>
        {data.perRep.length === 0 ? (
          <p className="border-t border-line px-4 py-6 text-[13px] text-graphite">No one has sent anything yet.</p>
        ) : (
          <ul className="divide-y divide-line/70 border-t border-line">
            {data.perRep.map((rep) => (
              <li key={rep.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-ink">{rep.name}</span>
                  <span className="text-[12px] text-graphite">
                    {rep.connections} notes · {rep.dms} messages · {rep.followups} follow-ups · {rep.replies} replies
                  </span>
                </span>
                <span className={rep.total === 0 ? 'text-[13px] font-medium text-status-danger' : 'text-[13px] font-medium text-ink'}>
                  {rep.total === 0 ? 'Nothing sent' : rep.total}
                </span>
              </li>
            ))}
          </ul>
        )}
        {quiet.length > 0 && data.perRep.some((rep) => rep.total > 0) && (
          <p className="border-t border-line px-4 py-2 text-[12px] text-status-danger">
            {quiet.map((rep) => rep.name).join(', ')} {quiet.length === 1 ? 'has' : 'have'} not sent anything.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-line bg-bone-raised p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Just happened</p>
          <span className="text-[11px] text-stone">updated {relativeTime(data.generatedAt, now)}</span>
        </div>
        <div className="mt-3 space-y-1.5">
          {data.stream.length === 0 ? (
            <p className="py-4 text-[13px] text-graphite">Nothing yet today.</p>
          ) : (
            data.stream.slice(0, 8).map((item) => (
              <p key={item.id} className="text-[13px] text-ink">
                <span className="text-stone">{relativeTime(item.occurredAt, now)}</span>
                {' '}
                <span className="font-medium">{item.actorName}</span> {item.label}
              </p>
            ))
          )}
        </div>
      </section>
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
