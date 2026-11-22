import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { currentInstant, orgDate } from '@/lib/org-clock'
import { getAccountabilityLedger, getOrganizationDailySummary } from '@/lib/execution/accountability'

export const dynamic = 'force-dynamic'

/**
 * The canonical daily accountability summary for the organization.
 *
 * Admin/owner only. This is the authority every other surface should read; it is
 * exposed here so a client can compare its own numbers against it.
 */
export async function GET() {
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(auth, 'VIEW_TEAM_ANALYTICS')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }
  const policy = await loadOperatingPolicy(auth.orgId).catch(() => null)
  const businessDate = orgDate(currentInstant(), policy?.timezone ?? 'UTC')
  const client = await createServerSupabase()
  const [summary, ledger] = await Promise.all([
    getOrganizationDailySummary(client, {
      orgId: auth.orgId,
      businessDate,
      timezone: policy?.timezone ?? 'UTC',
    }),
    getAccountabilityLedger(client, {
      orgId: auth.orgId,
      businessDate,
      timezone: policy?.timezone ?? 'UTC',
    }),
  ])
  return NextResponse.json(
    { summary, populations: ledger.populations, ledger: ledger.rows },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
