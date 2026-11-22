'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { currentInstant, nextDateBoundary, orgDate } from '@/lib/org-clock'

/**
 * Keeps an open session on the current business date.
 *
 * Server components are rendered once per request, so a tab left open across
 * local midnight would keep showing yesterday's numbers. This component schedules
 * a `router.refresh()` at the organization-local midnight boundary and also
 * re-checks on focus / visibility, so an existing session rolls over without a
 * sign-out and without a full page reload.
 *
 * It renders nothing and never blocks first paint.
 */
export function BusinessDayRefresh({
  timezone,
  businessDate,
}: {
  timezone: string
  businessDate: string
}) {
  const router = useRouter()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const refreshIfRolledOver = () => {
      if (cancelled) return
      if (orgDate(currentInstant(), timezone) !== businessDate) router.refresh()
    }

    const schedule = () => {
      if (cancelled) return
      const { milliseconds } = nextDateBoundary(timezone)
      // Cap the wait so a suspended laptop cannot leave a stale timer; the
      // callback re-arms until the boundary actually passes.
      timer = setTimeout(() => {
        refreshIfRolledOver()
        schedule()
      }, Math.min(Math.max(milliseconds, 1_000), 60_000))
    }

    schedule()
    window.addEventListener('focus', refreshIfRolledOver)
    document.addEventListener('visibilitychange', refreshIfRolledOver)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('focus', refreshIfRolledOver)
      document.removeEventListener('visibilitychange', refreshIfRolledOver)
    }
  }, [timezone, businessDate, router])

  return null
}
