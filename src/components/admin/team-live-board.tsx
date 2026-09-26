'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDistance } from 'date-fns'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { TeamLivePayload, TeamLivePerson } from '@/lib/admin/team-live'

function relativeTime(iso: string | null, now: number): string {
  if (!iso) return 'quiet today'
  return `${formatDistance(new Date(iso), new Date(now))} ago`
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

      {sorted.some((person) => person.totalTarget > 0) && (
        <div className="rounded-lg border border-line bg-bone-raised px-2 py-3">
          <p className="px-2 text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Still open</p>
          <div style={{ height: Math.max(120, sorted.length * 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sorted.map((person) => ({ name: person.repName, left: person.totalRemaining, done: person.totalCompleted }))}
                layout="vertical"
                margin={{ top: 8, right: 12, bottom: 0, left: 4 }}
              >
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={88} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--ink)' }} />
                <Tooltip
                  cursor={{ fill: 'var(--bone)' }}
                  content={({ active, payload }) => {
                    const row = payload?.[0]?.payload as { name: string; left: number; done: number } | undefined
                    if (!active || !row) return null
                    return (
                      <div className="rounded-lg border border-line bg-bone-raised px-2.5 py-1.5 text-[11px] shadow-sm">
                        <p className="font-medium text-ink">{row.name}</p>
                        <p className="text-graphite">{row.done} done · {row.left} left</p>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="left" fill="var(--orange)" radius={[0, 4, 4, 0]} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
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
          <Progress
            className="mt-1.5"
            value={person.totalTarget > 0 ? person.totalCompleted : 0}
            max={person.totalTarget > 0 ? person.totalTarget : 1}
            size="md"
            variant={won ? 'success' : 'default'}
          />
        </span>
        <Badge variant={won ? 'success' : person.totalRemaining > 0 ? 'orange' : 'outline'}>
          {won ? 'Day won' : person.totalTarget > 0 ? `${person.totalRemaining} left` : 'No numbers'}
        </Badge>
      </Link>
    </li>
  )
}
