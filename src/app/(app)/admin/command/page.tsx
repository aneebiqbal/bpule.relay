import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth/organization'
import { loadTeamDay } from '@/lib/rep-day/team'
import { CommandCentre } from '@/components/admin/command-centre'
import type { RepDayState } from '@/lib/rep-day/state-machine'

export const dynamic = 'force-dynamic'

const STATES: RepDayState[] = ['NOT_STARTED', 'ACTIVE', 'AT_RISK', 'CRITICAL', 'READY_TO_CLOSE', 'CLOSED', 'MISSED']

/**
 * The one admin operating surface for today.
 *
 * It reads `loadTeamDay()` — the canonical team contract — and renders it.
 * It does not compute status, pace or ordering itself.
 */
export default async function CommandPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')
  if (!ctx.isAdmin && !ctx.isManager) redirect('/dashboard')

  const requested = (await searchParams).state
  const activeFilter = STATES.includes(requested as RepDayState) ? (requested as RepDayState) : 'ALL'

  const team = await loadTeamDay()
  return <CommandCentre team={team} activeFilter={activeFilter} />
}
