import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth/organization'
import { loadTeamDay } from '@/lib/rep-day/team'
import { CommandCentre } from '@/components/admin/command-centre'
import type { RepDayState } from '@/lib/rep-day/state-machine'
import { currentInstant, orgDate } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'

export const dynamic = 'force-dynamic'

const STATES: RepDayState[] = ['NOT_STARTED', 'ACTIVE', 'AT_RISK', 'CRITICAL', 'READY_TO_CLOSE', 'CLOSED', 'MISSED']

/**
 * The one admin operating surface for today.
 *
 * It reads `loadTeamDay()` — the canonical team contract — and renders it.
 * It does not compute status, pace or ordering itself. `?date=YYYY-MM-DD`
 * selects a past day; the loader judges it as of that day's close.
 */
export default async function CommandPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; date?: string }>
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')
  if (!ctx.isAdmin && !ctx.isManager) redirect('/dashboard')

  const params = await searchParams
  const requested = params.state
  const activeFilter = STATES.includes(requested as RepDayState) ? (requested as RepDayState) : 'ALL'

  const team = await loadTeamDay({ date: params.date })

  const policy = await loadOperatingPolicy(ctx.orgId)
  const today = orgDate(currentInstant(), policy.timezone)
  const yesterdayDate = new Date(`${today}T00:00:00Z`)
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1)
  const yesterday = yesterdayDate.toISOString().slice(0, 10)

  return (
    <CommandCentre
      team={team}
      activeFilter={activeFilter}
      today={today}
      yesterday={yesterday}
    />
  )
}
