'use client'

/**
 * The daily operating control — one compact row.
 *
 * Start day / End day and the explicit availability state. No card, no blocks:
 * the rep sees one line and acts on it.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from 'cn'

interface RepDayLike {
  businessDate?: string
  timezone?: string
  isWorkingDay?: boolean
  checkInAt?: string | null
  closedAt?: string | null
  state?: string
}

const AVAILABILITY_LABEL: Record<string, string> = {
  AVAILABLE: 'Available',
  WORKING: 'Working today',
  ON_LEAVE: 'On leave today',
  OFFLINE: 'Offline today',
  CHECKED_OUT: 'Day complete',
  UNAVAILABLE: 'Unavailable',
}

function formatTime(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
}

export function RepDayControl({ repDay }: { repDay?: RepDayLike }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [until, setUntil] = useState('')

  const timeZone = repDay?.timezone ?? 'UTC'
  const checkedIn = Boolean(repDay?.checkInAt)
  const closed = Boolean(repDay?.closedAt)

  async function call(key: string, url: string, body?: unknown) {
    setBusy(key)
    setError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.')
        return
      }
      router.refresh()
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-bone px-4 py-3 ring-1 ring-line/70">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink">
          {closed
            ? `Day complete · Ended ${formatTime(repDay?.closedAt ?? '', timeZone)}`
            : checkedIn
              ? `Working today · Started ${formatTime(repDay?.checkInAt ?? '', timeZone)}`
              : repDay?.isWorkingDay === false
                ? 'Not a working day'
                : 'You have not started your day'}
        </p>
        {error && <p role="alert" className="mt-0.5 text-[12px] text-status-danger">{error}</p>}
      </div>

      {!closed && (
        <div className="flex flex-wrap items-center gap-2">
          {!checkedIn ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => call('checkin', '/api/rep/day')}
              className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              Start day
            </button>
          ) : (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => call('close', '/api/rep/day/close', { mode: 'incomplete' })}
              className="rounded-lg border border-line bg-bone-raised px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-bone disabled:opacity-60"
            >
              End day
            </button>
          )}

          <span className="hidden h-3 w-px bg-line sm:block" aria-hidden />

          <AvailabilityButton label="On leave" active={false} disabled={busy !== null} onClick={() => call('leave', '/api/rep/availability', { state: 'ON_LEAVE', note: 'On leave today' })} />
          <AvailabilityButton label="Unavailable" active={false} disabled={busy !== null} onClick={() => call('offline', '/api/rep/availability', { state: 'UNAVAILABLE', note: 'Unavailable today' })} />
          <AvailabilityButton label="Available" active={false} disabled={busy !== null} onClick={() => call('available', '/api/rep/availability', { state: 'AVAILABLE', note: 'Available today' })} />
          <label className="flex items-center gap-1.5 text-[12px] text-graphite">
            <span className="hidden sm:inline">Until</span>
            <input
              type="date"
              value={until}
              onChange={(event) => setUntil(event.target.value)}
              className="rounded-md border border-line bg-bone-raised px-2 py-1 text-[12px] text-ink"
            />
            <button
              type="button"
              disabled={busy !== null || !until}
              onClick={() => call('unavailable', '/api/rep/availability', { state: 'UNAVAILABLE', effectiveUntil: until, note: `Unavailable until ${until}` })}
              className="rounded-md border border-line bg-bone-raised px-2 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-bone disabled:opacity-60"
            >
              Set
            </button>
          </label>
        </div>
      )}
    </div>
  )
}

function AvailabilityButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-[12px] font-medium ring-1 transition-colors disabled:opacity-60',
        active ? 'bg-solid text-on-solid ring-solid' : 'bg-bone-raised text-ink ring-line hover:bg-bone',
      )}
    >
      {label}
    </button>
  )
}
