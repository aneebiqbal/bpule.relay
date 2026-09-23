'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { User } from 'lucide-react'
import { cn } from 'cn'
import { StatusBadge } from '@/components/ui/status-badge'

type IdentityInfo = { name: string; title: string | null; channel: string }
type Goal = { activityType: string; label: string; target: number; completed: number; remaining: number; identityId: string }
type Person = {
  repId: string
  repName: string
  role: string
  identities: IdentityInfo[]
  goals: Goal[]
  outreachSent: number
  repliesHandled: number
  leadsSaved: number
  extractionsCount: number
  extractionFailures: number
  totalTarget: number
  totalCompleted: number
  totalRemaining: number
  lastActivityAt: string | null
  identityCount: number
}
type Payload = { date: string; people: Person[] }

function relativeTime(iso: string | null, now: number): string {
  if (!iso) return 'no activity yet'
  const diff = now - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function paceVariant(person: Person): 'success' | 'warning' | 'danger' {
  if (person.totalTarget === 0) return 'success'
  const ratio = person.totalCompleted / person.totalTarget
  if (ratio >= 0.6) return 'success'
  if (ratio >= 0.3) return 'warning'
  return 'danger'
}

export function TeamLiveBoard() {
  const [data, setData] = useState<Payload | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/team-live')
      if (res.status === 403) { setError('Not authorized.'); return }
      if (!res.ok) { setError('Failed to load team activity.'); return }
      const json = (await res.json()) as Payload
      setData(json)
      setError(null)
    } catch {
      setError('Failed to load team activity.')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const tick = () => { if (!cancelled) setNow(Date.now()) }
    const onFocus = () => { if (!cancelled) { load(); tick() } }
    load()
    const dataInterval = setInterval(() => { if (!cancelled) load() }, 15_000)
    const tickInterval = setInterval(tick, 15_000)
    window.addEventListener('focus', onFocus)
    return () => { cancelled = true; clearInterval(dataInterval); clearInterval(tickInterval); window.removeEventListener('focus', onFocus) }
  }, [load])

  if (error) {
    return <p className="rounded border border-status-warning/20 bg-status-warning/5 px-3 py-2 text-[12px] text-status-warning">{error}</p>
  }

  if (!data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-line bg-bone-raised" />
        ))}
      </div>
    )
  }

  const working = data.people.filter((p) => p.totalCompleted > 0 || p.leadsSaved > 0 || p.extractionsCount > 0 || p.lastActivityAt)
  const idle = data.people.filter((p) => !working.includes(p))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Team · live</p>
        <p className="text-[11px] text-graphite">{data.people.length} people</p>
      </div>

      {working.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-stone mb-2">Active now</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {working.map((person) => (
              <PersonCard key={person.repId} person={person} now={now} />
            ))}
          </div>
        </div>
      )}

      {idle.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-stone mb-2">Not yet active</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {idle.map((person) => (
              <Link key={person.repId} href={`/team/${person.repId}`} className="flex items-center gap-3 rounded-lg border border-line bg-bone-raised px-3 py-2.5 transition-colors hover:bg-bone">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bone text-stone">
                  <User className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-ink">{person.repName}</p>
                  <p className="truncate text-[10px] text-graphite">{person.identities.length > 0 ? person.identities.map((i) => i.name).join(', ') : 'No identity assigned'}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PersonCard({ person, now }: { person: Person; now: number }) {
  const variant = paceVariant(person)
  const workingAs = person.identities[0]

  return (
    <div className="rounded-xl border border-line bg-bone-raised p-3.5 transition-colors hover:bg-bone/60">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/team/${person.repId}`} className="min-w-0 flex-1 hover:underline">
          <p className="truncate text-[13px] font-medium text-ink">{person.repName}</p>
          {workingAs && (
            <p className="truncate text-[10px] text-graphite">
              working as {workingAs.name}{workingAs.title ? ` · ${workingAs.title}` : ''} · {workingAs.channel.toUpperCase()}
            </p>
          )}
        </Link>
        <StatusBadge
          status={relativeTime(person.lastActivityAt, now)}
          variant={variant}
          className="shrink-0"
        />
      </div>

      {person.goals.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {person.goals.slice(0, 3).map((goal, i) => {
            const gp = goal.target > 0 ? Math.min(100, Math.round((goal.completed / goal.target) * 100)) : 0
            return (
              <div key={`${goal.activityType}-${i}`}>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-graphite">{goal.label}</span>
                  <span className={cn('text-mono-medium', goal.remaining === 0 ? 'text-status-success' : 'text-ink')}>
                    {goal.completed}/{goal.target}
                  </span>
                </div>
                <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-bone">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', gp >= 60 ? 'bg-status-success' : gp >= 30 ? 'bg-orange' : 'bg-status-warning')}
                    style={{ width: `${gp}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-graphite">
        {person.leadsSaved > 0 && <span>{person.leadsSaved} leads</span>}
        {person.outreachSent > 0 && <span>{person.outreachSent} sent</span>}
        {person.repliesHandled > 0 && <span>{person.repliesHandled} replies</span>}
        {person.extractionsCount > 0 && (
          <span className={person.extractionFailures > 0 ? 'text-status-warning' : ''}>
            {person.extractionsCount} extractions{person.extractionFailures > 0 ? ` (${person.extractionFailures} failed)` : ''}
          </span>
        )}
        {person.totalRemaining > 0 && (
          <span className="text-mono-medium text-ink">{person.totalRemaining} left</span>
        )}
      </div>
    </div>
  )
}
