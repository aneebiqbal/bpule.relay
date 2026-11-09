'use client'

/**
 * A manager/admin sets a rep's availability for the business day. The database
 * policy enforces the same scope as the API; this control only renders it.
 */
import { useState } from 'react'
import { labelForAvailability, type AvailabilityState } from '@/lib/coverage/engine'

const STATES: AvailabilityState[] = ['AVAILABLE', 'WORKING', 'ON_LEAVE', 'OFFLINE', 'CHECKED_OUT', 'UNAVAILABLE']

export function RepAvailabilityControl({
  repId,
  initial,
}: {
  repId: string
  initial: AvailabilityState | null
}) {
  const [state, setState] = useState<AvailabilityState>(initial ?? 'AVAILABLE')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/team/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId, state }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Availability could not be saved.')
        return
      }
      setNotice('Availability saved.')
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="rep-availability" className="text-[12px] text-graphite">
        Availability
      </label>
      <select
        id="rep-availability"
        value={state}
        onChange={(event) => setState(event.target.value as AvailabilityState)}
        className="h-9 rounded-lg border border-line bg-bone-raised px-2 text-[12px] text-ink"
      >
        {STATES.map((value) => (
          <option key={value} value={value}>
            {labelForAvailability(value)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || state === initial}
        className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-bone disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
      {error && <span role="alert" className="text-[12px] text-status-danger">{error}</span>}
      {notice && <span role="status" className="text-[12px] text-status-success">{notice}</span>}
    </div>
  )
}
