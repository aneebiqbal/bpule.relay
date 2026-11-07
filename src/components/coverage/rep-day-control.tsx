'use client'

/**
 * The rep's day as one control.
 *
 * Home does not render the availability system inline. A single status pill
 * opens the canonical check-in/out and availability actions.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from 'cn'

interface RepDayLike {
  businessDate?: string
  timezone?: string
  isWorkingDay?: boolean
  checkInAt?: string | null
  closedAt?: string | null
}

function formatTime(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
}

const ITEM =
  'block w-full rounded px-2 py-1.5 text-left text-[12px] text-ink transition-colors hover:bg-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:opacity-60'

export function RepDayControl({ repDay }: { repDay?: RepDayLike }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timeZone = repDay?.timezone ?? 'UTC'
  const checkedIn = Boolean(repDay?.checkInAt)
  const closed = Boolean(repDay?.closedAt)
  const workingDay = repDay?.isWorkingDay ?? true

  async function call(url: string, body?: unknown) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Try again.')
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const label = closed
    ? 'Day complete'
    : checkedIn
      ? 'Working today'
      : workingDay
        ? 'Not started'
        : 'Not a working day'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={closed || busy}
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40',
          closed ? 'bg-bone text-stone ring-line' : 'bg-bone-raised text-ink ring-line hover:bg-bone',
        )}
      >
        {label}
        {!closed && (
          <ChevronDown className={cn('size-3.5 text-stone transition-transform', open && 'rotate-180')} aria-hidden />
        )}
      </button>

      {open && !closed && (
        <div className="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-44 rounded-lg border border-line bg-bone-raised p-1.5 shadow-lg">
          {!checkedIn && (
            <button type="button" disabled={busy} onClick={() => call('/api/rep/day')} className={ITEM}>
              Start day
            </button>
          )}
          {checkedIn && (
            <button
              type="button"
              disabled={busy}
              onClick={() => call('/api/rep/day/close', { mode: 'incomplete' })}
              className={ITEM}
            >
              End day
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => call('/api/rep/availability', { state: 'ON_LEAVE', note: 'On leave today' })}
            className={ITEM}
          >
            On leave
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => call('/api/rep/availability', { state: 'UNAVAILABLE', note: 'Unavailable today' })}
            className={ITEM}
          >
            Unavailable
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-1 text-[11px] text-status-danger">
          {error}
        </p>
      )}
    </div>
  )
}

/** The check-in time, for the header meta. Empty when the day has not started. */
export function repDayStartTime(repDay?: RepDayLike): string {
  if (!repDay?.checkInAt) return ''
  return formatTime(repDay.checkInAt, repDay.timezone ?? 'UTC')
}
