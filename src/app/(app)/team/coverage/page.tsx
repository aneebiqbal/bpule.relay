import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth/organization'
import { addDays, currentInstant, orgDate } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { loadCoveragePlan, loadCoverageReview } from '@/lib/coverage/load'
import { CoverageReviewView } from '@/components/coverage/coverage-review'

export const dynamic = 'force-dynamic'

/**
 * Weekly coverage review — the place an admin improves the system rather than
 * operating it by hand: gaps, leave coverage events, repeated overload and
 * frequently used backups.
 */
export default async function TeamCoveragePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')
  if (!ctx.isAdmin && !ctx.isManager) redirect('/dashboard')

  const params = await searchParams
  const policy = await loadOperatingPolicy(ctx.orgId)
  const today = orgDate(currentInstant(), policy.timezone)
  const to = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today
  const from = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : addDays(to, -6)

  const [review, plan] = await Promise.all([
    loadCoverageReview(ctx.orgId, { from, to }),
    loadCoveragePlan(ctx.orgId),
  ])

  return <CoverageReviewView review={review} plan={plan} from={from} to={to} />
}
