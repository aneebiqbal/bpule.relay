/**
 * GET /billing/session?session_id=...
 *
 * Returned here after Stripe Checkout completes. CRITICAL: we do NOT grant
 * Premium based on this redirect — the verified Stripe webhook is the only
 * authority (guardrail #5). This page reads the org's plan fresh from the DB.
 *
 * Flow:
 *   - If Premium is already confirmed (webhook arrived before the redirect),
 *     go straight to the dashboard — no standalone success page.
 *   - Otherwise, show a brief "activating" state with a client poller that
 *     waits for the webhook to update the DB, then redirects to the dashboard.
 *   - If the webhook never arrives, the poller times out and shows a
 *     manual-retry message (never grants Premium).
 *
 * The final destination after successful activation is always /dashboard.
 */
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { isPremium } from '@/lib/billing/premium'
import { BillingStatusPoller } from './poller'

export const dynamic = 'force-dynamic'

export default async function BillingSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  // Server-side auth — never trust client state for premium status.
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { session_id } = await searchParams

  // Server checks the authoritative DB state. If the webhook already
  // flipped the plan to active, go straight to the dashboard.
  if (isPremium(user.organization.plan)) {
    redirect('/dashboard')
  }

  // Webhook hasn't arrived yet (or hasn't finished). Show the poller,
  // which polls /api/me/billing and redirects to /dashboard once Premium
  // is confirmed by the server.
  return <BillingStatusPoller session_id={session_id} />
}
