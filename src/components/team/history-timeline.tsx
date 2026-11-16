'use client'

/**
 * Operational audit timeline for one person.
 *
 * Every event comes from an existing audit authority; nothing is fabricated.
 * Filters narrow by category and the timeline groups by day without collapsing
 * the individual rows.
 */
import { useEffect, useMemo, useState } from 'react'
import { V4Chip, V4Empty } from '@/components/v4/primitives'
import { InlineError } from '@/components/operations/ops-primitives'
import { cn } from 'cn'

type Kind = 'assignment' | 'target' | 'schedule' | 'knowledge' | 'execution' | 'coverage' | 'acknowledgement'

interface AuditEvent {
  id: string
  at: string | null
  kind: string
  actor: string
  action: string
  entity: string
  target: string | null
  before: unknown
  after: unknown
  reason: string | null
}

const FILTERS: Array<{ value: Kind | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'assignment', label: 'Assignments' },
  { value: 'target', label: 'Targets' },
  { value: 'schedule', label: 'Schedules' },
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'execution', label: 'Execution' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'acknowledgement', label: 'Acknowledgements' },
]

function describe(event: AuditEvent): string {
  const target = event.target ? ` · ${event.target}` : ''
  if (event.kind === 'knowledge') {
    const field = event.action === 'update' && event.before && event.after
      ? ` changed`
      : ''
    return `${event.action} ${event.entity}${field}${target}`
  }
  if (event.kind === 'assignment') return `${event.action.replaceAll('_', ' ')}${target}`
  if (event.kind === 'coverage') return `${event.action.replaceAll('_', ' ')}${event.after ? ` · ${event.after}` : ''}`
  if (event.kind === 'acknowledgement') return `${event.action.replaceAll('_', ' ')} · ${event.entity}${event.after ? ` · ${event.after}` : ''}`
  return `${event.action.replaceAll('_', ' ')} ${event.entity}${target}`
}

function values(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

export function HistoryTimeline({ profileId }: { profileId: string }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<Kind | 'all'>('all')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/team/profiles/${profileId}/history`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'Could not load history.')
        if (!cancelled) setEvents(body.events ?? [])
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [profileId])

  const filtered = useMemo(() => {
    if (!events) return []
    if (filter === 'all') return events
    if (filter === 'target') return events.filter((event) => event.kind === 'assignment' && String(event.action).includes('target'))
    if (filter === 'schedule') return events.filter((event) => event.kind === 'schedule')
    if (filter === 'execution') return events.filter((event) => event.kind === 'assignment' || event.kind === 'coverage')
    return events.filter((event) => event.kind === filter)
  }, [events, filter])

  const grouped = useMemo(() => {
    const byDay = new Map<string, AuditEvent[]>()
    for (const event of filtered) {
      const day = event.at ? event.at.slice(0, 10) : 'Unknown date'
      const list = byDay.get(day) ?? []
      list.push(event)
      byDay.set(day, list)
    }
    return [...byDay.entries()]
  }, [filtered])

  if (failed) return <InlineError>History could not be loaded. Refresh to try again.</InlineError>
  if (events === null) return <p className="text-[12px] text-stone">Loading history…</p>
  if (events.length === 0) return <V4Empty title="No audit history yet" body="Assignment, target, knowledge and coverage changes will appear here." />

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors',
              filter === option.value ? 'bg-solid text-on-solid ring-solid' : 'bg-bone text-graphite ring-line hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {grouped.length === 0 ? (
        <V4Empty title="Nothing in this category" body="Choose another filter." />
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, rows]) => (
            <div key={day}>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{day}</p>
              <ol className="mt-1.5 space-y-1.5 border-l border-line pl-3">
                {rows.map((event) => {
                  const before = values(event.before)
                  const after = values(event.after)
                  return (
                    <li key={event.id} className="rounded-lg bg-bone px-3 py-2 ring-1 ring-line/70">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[12px] font-medium text-ink">{describe(event)}</p>
                        <span className="flex items-center gap-1.5">
                          <V4Chip>{event.kind}</V4Chip>
                          <span className="text-[11px] text-stone">{event.actor}</span>
                          {event.at && <time className="text-[11px] text-stone">{new Date(event.at).toLocaleTimeString()}</time>}
                        </span>
                      </div>
                      {(before || after) && (
                        <p className="mt-1 break-words text-[11px] text-graphite">
                          {before && <span className="text-status-danger">− {before}</span>}
                          {before && after && <span className="mx-1 text-stone">→</span>}
                          {after && <span className="text-status-success">+ {after}</span>}
                        </p>
                      )}
                      {event.reason && before == null && after == null && (
                        <p className="mt-1 text-[11px] text-stone">{event.reason}</p>
                      )}
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
