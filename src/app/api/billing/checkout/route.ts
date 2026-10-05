/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout Session for the Premium subscription. The org and rep
 * are derived from the authenticated server-side session — NEVER from client
 * input. A malicious user cannot checkout on behalf of another org.
 *
 * Preconditions (server-enforced):
 *   - User must be authenticated (401 otherwise)
 *   - Org must NOT already be premium (409 otherwise)
 *   - Demo mode is blocked (400 otherwise — no real charges in demo)
 *
 * Returns { url } — the Stripe Checkout URL for client-side redirect.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { isDemoMode } from '@/lib/ai/config'
import { isPremium } from '@/lib/billing/premium'
import { findOrCreateCustomer, getPremiumPriceId, getStripe } from '@/lib/billing/stripe'
import { canonicalUrl } from '@/lib/site-config'
import { safeErrorResponse } from '@/lib/errors'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Identity is server-resolved. We do NOT read orgId or repId from the
    // request body — that would let a user checkout on behalf of another org.
    const org = user.organization

    // Demo mode: block real charges. Demo org is already premium (active).
    if (isDemoMode()) {
      return NextResponse.json(
        { error: 'Checkout is not available in demo mode.' },
        { status: 400 },
      )
    }

    // Already premium — no need to checkout again.
    if (isPremium(org.plan)) {
      return NextResponse.json(
        { error: 'This organization already has an active Premium subscription.' },
        { status: 409 },
      )
    }

    const stripe = getStripe()
    const priceId = getPremiumPriceId()

    // Find or create the Stripe customer. The customer id is persisted back
    // to the org so future checkouts reuse it.
    const customerId = await findOrCreateCustomer(org)

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      // Server-resolved metadata — never client-supplied. The webhook reads
      // this to know which org the subscription belongs to.
      metadata: {
        orgId: org.id,
        repId: user.rep.id,
      },
      subscription_data: {
        metadata: {
          orgId: org.id,
        },
      },
      // client_reference_id lets us correlate the session back to the org if
      // metadata is ever unavailable (it isn't, but defense in depth).
      client_reference_id: org.id,
      success_url: canonicalUrl('/billing/session?session_id={CHECKOUT_SESSION_ID}'),
      cancel_url: canonicalUrl('/billing/cancel'),
      // Automatic tax can be enabled later; off for now.
      automatic_tax: { enabled: false },
    })

    if (!session.url) {
      return NextResponse.json(
        { error: 'Failed to create Checkout session.' },
        { status: 500 },
      )
    }

    return NextResponse.json({ url: session.url })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to start checkout.', '/api/billing/checkout')
  }
}
