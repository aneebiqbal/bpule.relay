/**
 * POST /api/billing/cancel
 *
 * Cancels the authenticated organization's active Premium subscription at the
 * end of the current billing period. The user retains Premium access until the
 * period ends — we do NOT revoke immediately (that would be a poor UX for a
 * payment already made).
 *
 * Security:
 *   - User must be authenticated (401 otherwise).
 *   - The org must currently be premium (409 otherwise — nothing to cancel).
 *   - Demo mode is blocked (400 — demo has no real subscription).
 *   - The subscription is looked up from the SERVER-SIDE database by the
 *     authenticated org's id. The client never supplies a subscription id.
 *   - The Stripe call uses the server-held secret key — the browser never
 *     touches it.
 *
 * The actual plan revocation is NOT done here. Stripe sends a
 * `customer.subscription.updated` event (with cancel_at_period_end: true, status
 * still 'active') followed by `customer.subscription.deleted` at period end. The
 * webhook handler materializes those into `organizations.plan`. This endpoint
 * only REQUESTS cancellation — Stripe + webhook remain authoritative for the
 * plan state. The UI should poll /api/me/billing to reflect the change.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { isDemoMode } from '@/lib/ai/config'
import { isPremium } from '@/lib/billing/premium'
import { getStripe } from '@/lib/billing/stripe'
import { createServiceSupabase } from '@/lib/supabase/service'
import { safeErrorResponse } from '@/lib/errors'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const org = user.organization

    // Demo mode: no real subscription to cancel.
    if (isDemoMode()) {
      return NextResponse.json(
        { error: 'Subscription management is not available in demo mode.' },
        { status: 400 },
      )
    }

    // Not premium — nothing to cancel. This is a guardrail: we never call
    // Stripe unless the org is currently active.
    if (!isPremium(org.plan)) {
      return NextResponse.json(
        { error: 'This organization does not have an active Premium subscription.' },
        { status: 409 },
      )
    }

    const client = createServiceSupabase()

    // Look up the org's active subscription from the DB. We use the
    // server-side org id from the authenticated session — never client input.
    // Status 'active' is the live subscription; a canceled/expired row is the
    // audit trail and must not be re-canceled.
    const { data: subRow, error: subError } = await client
      .from('subscriptions')
      .select('stripe_subscription_id, status, current_period_end')
      .eq('organization_id', org.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subError) {
      return safeErrorResponse(subError, 500, 'Failed to look up subscription.', '/api/billing/cancel')
    }

    if (!subRow?.stripe_subscription_id) {
      // No active subscription in our records. The org is premium (plan =
      // 'active') but we have no subscription row to cancel — possibly the
      // webhook hasn't synced, or the row was never created. We cannot cancel
      // what we can't identify. Return 404 so the UI can show a helpful message.
      return NextResponse.json(
        { error: 'No active subscription found for this organization.' },
        { status: 404 },
      )
    }

    // Cancel at period end via Stripe. This sets cancel_at_period_end: true on
    // the subscription. Stripe will fire customer.subscription.updated (status
    // still 'active', cancel_at_period_end: true) which the webhook persists.
    // At period end, Stripe fires customer.subscription.deleted which revokes
    // premium. We do NOT set the plan here — the webhook is authoritative.
    const stripe = getStripe()
    const canceled = await stripe.subscriptions.update(subRow.stripe_subscription_id, {
      cancel_at_period_end: true,
    })

    return NextResponse.json({
      cancel_at_period_end: canceled.cancel_at_period_end,
      current_period_end: canceled.current_period_end
        ? new Date(canceled.current_period_end * 1000).toISOString()
        : null,
      message: 'Your Premium subscription will cancel at the end of the current billing period.',
    })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to cancel subscription.', '/api/billing/cancel')
  }
}
