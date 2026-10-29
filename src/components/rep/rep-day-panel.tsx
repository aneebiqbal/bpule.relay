'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from 'cn'
import type { RepDayView } from '@/lib/rep-day/load'
import { repDayStateLabel, type RepDayState } from '@/lib/rep-day/state-machine'

const STATE_TONE: Record<RepDayState, string> = {
  NOT_STARTED: 'border-line bg-bone-raised text-graphite',
  ACTIVE: 'border-status-success/30 bg-status-success/[0.06] text-status-success',
  AT_RISK: 'border-orange/30 bg-orange/[0.06] text-orange',
  CRITICAL: 'border-status-danger/30 bg-status-danger/[0.06] text-status-danger',
  READY_TO_CLOSE: 'border-status-success/30 bg-status-success/[0.08] text-status-success',
  CLOSED: 'border-line bg-bone-raised text-graphite',
  MISSED: 'border-status-danger/30 bg-status-danger/[0.04] text-status-danger',
}

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function stateMessage(day: RepDayView): string | null {
  if (!day.applicable) return 'No operating day today.'
  if (day.state === 'CLOSED') return 'Day closed.'
  if (day.state === 'MISSED') {
    return day.reason === 'not_closed'
      ? 'The workday ended without a close. It is recorded as missed.'
      : 'The workday ended with work outstanding. It is recorded as missed.'
  }
  if (day.state === 'READY_TO_CLOSE') return 'Your required work is complete. Close your day.'
  if (day.state === 'CRITICAL') {
    return `${day.minutesRemainingLabel} remain. ${day.requiredRemaining} required ${day.requiredRemaining === 1 ? 'action is' : 'actions are'} incomplete. At your current pace, today's commitment will not be met.`
  }
  if (day.state === 'AT_RISK') {
    return `You're behind today's target. ${day.minutesRemainingLabel} remain. ${day.requiredRemaining} required ${day.requiredRemaining === 1 ? 'action is' : 'actions are'} incomplete.`
  }
  if (day.state === 'NOT_STARTED' && day.reason === 'before_workday') {
    return `Your day opens at ${day.policy.workdayStart}.`
  }
  return null
}

export function RepDayPanel({ day }: { day: RepDayView }) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showException, setShowException] = useState(false)
  const [exceptionReason, setExceptionReason] = useState('meeting_heavy_day')
  const [exceptionNote, setExceptionNote] = useState('')

  const pct = Math.round(day.commitmentProgress * 100)
  const message = stateMessage(day)
  const canCheckIn = day.applicable && !day.checkInAt && !day.closedAt && day.reason !== 'before_workday' && day.state !== 'MISSED'
  const canClose = day.applicable && !day.closedAt && day.state !== 'CLOSED' && day.state !== 'MISSED'
  const visibleCommitments = day.commitments.filter((row) => row.measured || row.target > 0)

  async function act(kind: 'checkin' | 'close-complete' | 'close-incomplete' | 'exception') {
    setPending(kind)
    setError(null)
    try {
      const response =
        kind === 'checkin'
          ? await fetch('/api/rep/day', { method: 'POST' })
          : kind === 'exception'
            ? await fetch('/api/rep/day/exception', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ reason: exceptionReason, note: exceptionNote || null }),
              })
            : await fetch('/api/rep/day/close', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ mode: kind === 'close-incomplete' ? 'incomplete' : 'complete' }),
              })

      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(body.error ?? 'Something went wrong. Try again.')
        return
      }
      setShowException(false)
      router.refresh()
    } catch {
      setError('Network error. Your day was not changed.')
    } finally {
      setPending(null)
    }
  }

  return (
    <section aria-labelledby="rep-day-heading" className="space-y-4">
      <div className="rounded-lg border border-line bg-bone-raised p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 id="rep-day-heading" className="text-[18px] font-medium tracking-[-0.01em] text-ink">
              {greeting(day.localHour)}, {day.repName.split(' ')[0]}
            </h1>
            <p className="mt-1 text-[12px] text-graphite">
              {day.applicable
                ? `${day.minutesRemainingLabel} remaining · ${day.policy.workdayStart}–${day.policy.workdayEnd} ${day.timezone}`
                : `Not a working day · ${day.timezone}`}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]',
              STATE_TONE[day.state],
            )}
          >
            {day.applicable ? repDayStateLabel(day.state) : 'No operating day'}
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[28px] font-medium leading-none tracking-[-0.02em] text-ink">{pct}%</p>
            <p className="mt-1 text-[11px] text-stone">of today&apos;s commitment</p>
          </div>
          <p className="text-right text-[11px] text-graphite">
            {day.commitments.reduce((sum, row) => sum + (row.unit === 'count' ? Math.min(row.completed, row.target) : 0), 0)}
            {' of '}
            {day.commitments.reduce((sum, row) => sum + (row.unit === 'count' ? row.target : 0), 0)}
            {' actions'}
          </p>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line/50" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]',
              day.state === 'CRITICAL' || day.state === 'MISSED' ? 'bg-status-danger' : day.state === 'AT_RISK' ? 'bg-orange' : 'bg-status-success',
            )}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>

        {message && (
          <p
            className={cn(
              'mt-3 text-[12px] leading-relaxed',
              day.state === 'CRITICAL' || day.state === 'MISSED' ? 'text-status-danger' : 'text-graphite',
            )}
            role="status"
          >
            {message}
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-md border border-status-danger/30 bg-status-danger/[0.04] px-3 py-2 text-[12px] text-status-danger" role="alert">
            {error}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {canCheckIn && (
            <button
              type="button"
              onClick={() => act('checkin')}
              disabled={pending !== null}
              className="min-h-11 rounded-md bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {pending === 'checkin' ? 'Starting…' : 'Start my day'}
            </button>
          )}
          {canClose && day.state === 'READY_TO_CLOSE' && (
            <button
              type="button"
              onClick={() => act('close-complete')}
              disabled={pending !== null}
              className="min-h-11 rounded-md bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {pending === 'close-complete' ? 'Closing…' : 'Close my day'}
            </button>
          )}
          {canClose && day.state !== 'READY_TO_CLOSE' && (
            <>
              <button
                type="button"
                onClick={() => act('close-incomplete')}
                disabled={pending !== null}
                className="min-h-11 rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:text-ink disabled:opacity-60"
              >
                {pending === 'close-incomplete' ? 'Closing…' : 'Close incomplete'}
              </button>
              <button
                type="button"
                onClick={() => setShowException((open) => !open)}
                className="min-h-11 rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
              >
                Request exception
              </button>
            </>
          )}
          {day.closedAt && (
            <span className="rounded-md border border-line px-3 py-1.5 text-[12px] text-graphite">
              Closed at {new Date(day.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {showException && (
          <form
            className="mt-3 space-y-2 rounded-md border border-line bg-bone p-3"
            onSubmit={(event) => {
              event.preventDefault()
              act('exception')
            }}
          >
            <label className="block text-[11px] font-medium uppercase tracking-[0.12em] text-stone" htmlFor="exception-reason">
              Reason
            </label>
            <select
              id="exception-reason"
              value={exceptionReason}
              onChange={(event) => setExceptionReason(event.target.value)}
              className="w-full rounded-md border border-line bg-bone-raised px-2.5 py-1.5 text-[12px] text-ink"
            >
              <option value="meeting_heavy_day">Meeting-heavy day</option>
              <option value="client_call">Client call</option>
              <option value="training">Training</option>
              <option value="technical_outage">Technical outage</option>
              <option value="leave">Leave</option>
              <option value="admin_override">Admin override</option>
              <option value="other">Other</option>
            </select>
            <input
              value={exceptionNote}
              onChange={(event) => setExceptionNote(event.target.value)}
              placeholder="Optional note for your admin"
              className="w-full rounded-md border border-line bg-bone-raised px-2.5 py-1.5 text-[12px] text-ink placeholder:text-stone"
            />
            <button
              type="submit"
              disabled={pending !== null}
              className="min-h-11 rounded-md bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid disabled:opacity-60"
            >
              {pending === 'exception' ? 'Sending…' : 'Send request'}
            </button>
          </form>
        )}

        {day.exception.state === 'REQUESTED' && (
          <p className="mt-2 text-[11px] text-graphite">Exception requested — waiting for admin review.</p>
        )}
        {day.exception.state === 'APPROVED' && (
          <p className="mt-2 text-[11px] text-status-success">Exception approved for today.</p>
        )}
        {day.exception.state === 'REJECTED' && (
          <p className="mt-2 text-[11px] text-orange">Exception rejected — required work still applies.</p>
        )}
      </div>

      {visibleCommitments.length > 0 && (
        <div className="rounded-lg border border-line bg-bone-raised">
          <h2 className="border-b border-line px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.16em] text-stone">
            Today&apos;s commitments
          </h2>
          <ul className="divide-y divide-line/60">
            {visibleCommitments.map((row) => {
              const done = row.unit === 'percent' ? row.completed : Math.min(row.completed, row.target)
              const ratio = row.target > 0 ? Math.min(1, done / row.target) : 0
              return (
                <li key={row.key} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-24 shrink-0 text-[12px] text-ink">{row.label}</span>
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line/50">
                    <span
                      className={cn('block h-full rounded-full', row.remaining === 0 ? 'bg-status-success' : 'bg-orange')}
                      style={{ width: `${Math.round(ratio * 100)}%` }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right text-[12px] tabular-nums text-graphite">
                    {row.unit === 'percent' ? `${done}%` : `${done} / ${row.target}`}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {!day.persisted && (
        <p className="rounded-md border border-orange/30 bg-orange/[0.04] px-3 py-2 text-[11px] text-orange" role="status">
          Your day is not being saved yet: the rep-day table is missing in this database. Today still shows live numbers, but check-in and close are unavailable.
        </p>
      )}
    </section>
  )
}
