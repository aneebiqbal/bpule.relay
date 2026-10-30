'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Save } from 'lucide-react'
import { cn } from 'cn'
import type { OperatingPolicy } from '@/lib/org-clock'

const COMMON_ZONES = [
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
]

const DAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

/**
 * The organization's operating clock.
 *
 * Changing this changes every rep's business date, workday window, working
 * days, reset and pace thresholds — the whole team, end to end. It is the one
 * place an admin edits the clock; nothing is duplicated in code.
 */
export function OperatingHours({ initial }: { initial: OperatingPolicy }) {
  const router = useRouter()
  const [timezone, setTimezone] = useState(initial.timezone)
  const [workdayStart, setWorkdayStart] = useState(initial.workdayStart)
  const [workdayEnd, setWorkdayEnd] = useState(initial.workdayEnd)
  const [workingDays, setWorkingDays] = useState<number[]>(initial.workingDays)
  const [dailyResetTime, setDailyResetTime] = useState(initial.dailyResetTime)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  function toggleDay(day: number) {
    setWorkingDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort(),
    )
    setState('idle')
  }

  async function save() {
    setState('saving')
    setError(null)
    try {
      const response = await fetch('/api/admin/operating-policy', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timezone, workdayStart, workdayEnd, workingDays, dailyResetTime }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(body.error ?? 'Could not save the operating hours.')
        setState('error')
        return
      }
      setState('saved')
      router.refresh()
    } catch {
      setError('Network error. Nothing was changed.')
      setState('error')
    }
  }

  return (
    <section className="rounded-lg border border-line bg-bone-raised" aria-labelledby="operating-hours-heading">
      <div className="border-b border-line px-4 py-3">
        <h2 id="operating-hours-heading" className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <Clock className="size-3.5 text-stone" aria-hidden="true" />
          Operating hours
        </h2>
        <p className="mt-0.5 text-[11px] text-graphite">
          Applies to the whole team: business date, workday window, working days and the daily reset.
        </p>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Timezone</span>
            <input
              list="relay-timezones"
              value={timezone}
              onChange={(event) => {
                setTimezone(event.target.value)
                setState('idle')
              }}
              className="mt-1 min-h-11 w-full rounded-md border border-line bg-bone px-2.5 py-1.5 text-[13px] text-ink"
              aria-describedby="operating-hours-timezone-hint"
            />
            <datalist id="relay-timezones">
              {COMMON_ZONES.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            <span id="operating-hours-timezone-hint" className="mt-1 block text-[11px] text-stone">
              Any IANA zone, for example Asia/Karachi.
            </span>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Daily reset</span>
            <input
              type="time"
              value={dailyResetTime}
              onChange={(event) => {
                setDailyResetTime(event.target.value)
                setState('idle')
              }}
              className="mt-1 min-h-11 w-full rounded-md border border-line bg-bone px-2.5 py-1.5 text-[13px] text-ink"
            />
            <span className="mt-1 block text-[11px] text-stone">Local time the new operating day opens.</span>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Workday starts</span>
            <input
              type="time"
              value={workdayStart}
              onChange={(event) => {
                setWorkdayStart(event.target.value)
                setState('idle')
              }}
              className="mt-1 min-h-11 w-full rounded-md border border-line bg-bone px-2.5 py-1.5 text-[13px] text-ink"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Workday ends</span>
            <input
              type="time"
              value={workdayEnd}
              onChange={(event) => {
                setWorkdayEnd(event.target.value)
                setState('idle')
              }}
              className="mt-1 min-h-11 w-full rounded-md border border-line bg-bone px-2.5 py-1.5 text-[13px] text-ink"
            />
          </label>
        </div>

        <fieldset>
          <legend className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Working days</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DAYS.map((day) => {
              const active = workingDays.includes(day.value)
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  aria-pressed={active}
                  className={cn(
                    'min-h-11 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors',
                    active ? 'border-solid bg-solid text-on-solid' : 'border-line text-graphite hover:text-ink',
                  )}
                >
                  {day.label}
                </button>
              )
            })}
          </div>
        </fieldset>

        {error && (
          <p className="rounded-md border border-status-danger/30 bg-status-danger/[0.04] px-3 py-2 text-[12px] text-status-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={state === 'saving'}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <Save className="size-3.5" aria-hidden="true" />
            {state === 'saving' ? 'Saving…' : 'Save operating hours'}
          </button>
          <span aria-live="polite" className="text-[12px] text-graphite">
            {state === 'saved' ? 'Saved. Every rep’s day now uses these hours.' : ''}
          </span>
        </div>
      </div>
    </section>
  )
}
