'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, User } from 'lucide-react'
import { cn } from 'cn'
import { StatusBadge } from '@/components/ui/status-badge'
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

function paceVariant(person: TeamLivePerson): 'success' | 'warning' | 'danger' | 'neutral' {
  if (person.totalTarget === 0) return person.lastActivityAt ? 'success' : 'neutral'
  const ratio = person.totalCompleted / person.totalTarget
  if (ratio >= 0.6) return 'success'
  if (ratio >= 0.3) return 'warning'
  return 'danger'
}

function paceDetail(behind: number, target: number): string {
  if (behind > 0) return `${behind} behind pace`
  if (target > 0) return 'on pace'
  return 'no targets set'
}

function goalBarClass(percent: number): string {
  if (percent >= 60) return 'bg-status-success'
  if (percent >= 30) return 'bg-orange'
  return 'bg-status-warning'
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

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat label="Moving today" value={`${working.length}/${data.people.length}`} detail={paceDetail(behind.length, target)} />
        <SummaryStat label="Goals done" value={target > 0 ? `${completed}/${target}` : String(completed)} detail="today's targets" />
        <SummaryStat label="Leads saved" value={String(leadsSaved)} detail="created today" />
        <SummaryStat label="In the queue" value={String(openLeads)} detail={`${sent} messages sent today`} />
      </div>

      {data.people.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line py-10 text-center">
          <p className="text-sm text-graphite">No people in this workspace yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.people.map((person) => (
            <PersonCard key={person.repId} person={person} now={now} />
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryStat({ label, value, detail }: { readonly label: string; readonly value: string; readonly detail: string }) {
  return (
    <div className="rounded-xl border border-line/60 bg-bone-raised px-3.5 py-3">
      <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">{label}</p>
      <p className="mt-1 text-[20px] font-medium tracking-tight text-ink">{value}</p>
      <p className="text-[11px] text-graphite">{detail}</p>
    </div>
  )
}

function PersonCard({ person, now }: { readonly person: TeamLivePerson; readonly now: number }) {
  const variant = paceVariant(person)
  const workingAs = person.identities
  const extraLeads = Math.max(0, person.openLeadCount - person.openLeads.length)

  return (
    <article className="rounded-xl border border-line bg-bone-raised p-4">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/team/${person.repId}`} className="flex min-w-0 flex-1 items-start gap-2.5 hover:underline">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bone text-stone">
            <User className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-medium text-ink">{person.repName}</span>
            <span className="block truncate text-[11px] text-graphite">
              {workingAs.length > 0
                ? `working as ${workingAs.map((identity) => identity.name).join(', ')}`
                : 'No identity assigned'}
            </span>
          </span>
        </Link>
        <StatusBadge status={relativeTime(person.lastActivityAt, now)} variant={variant} className="shrink-0" />
      </div>

      {person.goals.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {person.goals.slice(0, 6).map((goal, i) => {
            const gp = goal.target > 0 ? Math.min(100, Math.round((goal.completed / goal.target) * 100)) : 0
            return (
              <div key={`${goal.activityType}-${goal.identityId}-${i}`}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-graphite">{goal.label}</span>
                  <span className={cn('text-mono-medium', goal.remaining === 0 ? 'text-status-success' : 'text-ink')}>
                    {goal.completed}/{goal.target}
                  </span>
                </div>
                <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-bone">
                  <div
                    className={cn('h-full rounded-full', goalBarClass(gp))}
                    style={{ width: `${gp}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-graphite">No daily targets set.</p>
      )}

      <div className="mt-3">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Working on</p>
        {person.openLeads.length > 0 ? (
          <ul className="mt-1.5 space-y-1">
            {person.openLeads.map((lead) => (
              <li key={lead.id}>
                <Link href={`/leads/${lead.id}`} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-[12px] hover:bg-bone">
                  <span className="min-w-0 truncate text-ink">
                    {lead.company}
                    {lead.contactName ? <span className="text-graphite"> · {lead.contactName}</span> : null}
                  </span>
                  <span className="shrink-0 text-[10px] text-graphite">
                    {lead.statusLabel}{lead.score !== null ? ` · ${lead.score}` : ''}
                  </span>
                </Link>
              </li>
            ))}
            {extraLeads > 0 && (
              <li className="px-1 text-[10px] text-graphite">+ {extraLeads} more open</li>
            )}
          </ul>
        ) : (
          <p className="mt-1.5 text-[12px] text-graphite">No open leads in the queue.</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line/60 pt-2.5 text-[11px]">
        <Count label="saved" value={person.leadsSaved} />
        <Count label="sent" value={person.outreachSent} />
        <Count label="replies" value={person.repliesHandled} />
        <Count label="captured" value={person.extractionsCount} warn={person.extractionFailures > 0} />
        <Count label="left" value={person.totalRemaining} emphasize={person.totalRemaining > 0} />
      </div>

      <Link href={`/team/${person.repId}`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-orange hover:text-orange/80">
        Open their day
        <ArrowUpRight className="size-3" />
      </Link>
    </article>
  )
}

function Count({ label, value, emphasize = false, warn = false }: { readonly label: string; readonly value: number; readonly emphasize?: boolean; readonly warn?: boolean }) {
  return (
    <span className={cn('text-graphite', emphasize && 'text-mono-medium text-ink', warn && 'text-status-warning')}>
      <span className={cn('text-mono-medium', value > 0 ? 'text-ink' : 'text-graphite', emphasize && 'text-ink', warn && 'text-status-warning')}>{value}</span>
      {' '}{label}
    </span>
  )
}
