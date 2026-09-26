'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from 'cn'
import type { TeamLivePayload, TeamLivePerson } from '@/lib/admin/team-live'

function relativeTime(iso: string | null, now: number): string {
  if (!iso) return 'quiet today'
  const diff = now - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function movedToday(person: TeamLivePerson): boolean {
  return person.totalCompleted > 0 || person.leadsSaved > 0 || person.outreachSent > 0 || person.repliesHandled > 0 || person.extractionsCount > 0 || Boolean(person.lastActivityAt)
}

export function TeamLiveBoard({ initial = null }: { readonly initial?: TeamLivePayload | null }) {
  const [data, setData] = useState<TeamLivePayload | null>(initial)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/team-live')
      if (res.status === 401) { setError('Sign in to see the team.'); return }
      if (!res.ok) { setError('Could not load what the team is working on.'); return }
      const json = (await res.json()) as TeamLivePayload
      setData(json)
      setError(null)
    } catch {
      setError('Could not load what the team is working on.')
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

  if (error && !data) {
    return <p className="rounded border border-status-warning/20 bg-status-warning/5 px-3 py-2 text-[12px] text-status-warning">{error}</p>
  }

  if (!data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl border border-line bg-bone-raised" />
        ))}
      </div>
    )
  }

  const working = data.people.filter(movedToday)
  const behind = data.people.filter((person) => person.totalTarget > 0 && person.totalCompleted / person.totalTarget < 0.3)
  const leadsSaved = data.people.reduce((sum, person) => sum + person.leadsSaved, 0)
  const sent = data.people.reduce((sum, person) => sum + person.outreachSent + person.repliesHandled, 0)
  const openLeads = data.people.reduce((sum, person) => sum + person.openLeadCount, 0)
  const completed = data.people.reduce((sum, person) => sum + person.totalCompleted, 0)
  const target = data.people.reduce((sum, person) => sum + person.totalTarget, 0)

  const sorted = [...data.people].sort((a, b) => b.totalRemaining - a.totalRemaining)

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink">
        {working.length} of {data.people.length} have started
        {target > 0 ? ` · ${completed} of ${target} done` : ''}
        {` · ${leadsSaved} profiles saved · ${sent} sent · ${openLeads} still open`}
      </p>
      {behind.length > 0 && (
        <p className="text-[13px] font-medium text-status-danger">
          {behind.length} {behind.length === 1 ? 'person is' : 'people are'} under a third of the day.
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[14px] text-graphite">No people yet.</p>
      ) : (
        <ul className="divide-y divide-line/70 overflow-hidden rounded-lg border border-line bg-bone-raised">
          {sorted.map((person) => (
            <PersonRow key={person.repId} person={person} now={now} />
          ))}
        </ul>
      )}
    </div>
  )
}

function PersonRow({ person, now }: { readonly person: TeamLivePerson; readonly now: number }) {
  const won = person.totalTarget > 0 && person.totalRemaining === 0
  const names = person.identities.map((identity) => identity.name).join(', ')
  return (
    <li>
      <Link href={`/team/${person.repId}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-bone">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-ink">{person.repName}</span>
          <span className="block truncate text-[12px] text-graphite">
            {names || 'No profile'}
            {' · '}
            {person.extractionsCount} pulled · {person.outreachSent} sent · {relativeTime(person.lastActivityAt, now)}
          </span>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-line/70">
            <span
              className={cn('block h-full rounded-full', won ? 'bg-status-success' : 'bg-orange')}
              style={{ width: `${person.totalTarget > 0 ? Math.round((person.totalCompleted / person.totalTarget) * 100) : 0}%` }}
            />
          </span>
        </span>
        <span className={cn('shrink-0 text-[13px] font-medium', won ? 'text-status-success' : person.totalRemaining > 0 ? 'text-ink' : 'text-graphite')}>
          {won ? 'Day won' : person.totalTarget > 0 ? `${person.totalRemaining} left` : 'No numbers'}
        </span>
      </Link>
    </li>
  )
}
