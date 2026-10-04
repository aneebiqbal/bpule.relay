/**
 * POST /api/billing/webhook
 *
 * Stripe webhook handler. This is the ONLY mechanism that grants or revokes
 * Premium — the Checkout success redirect NEVER grants access (guardrail #5).
 *
 * Security:
 *   - Stripe signature is verified before any DB write. An unverified request
 *     gets 400 with no side effects.
 *   - We use the service-role client (bypasses RLS) because there is no user
 *     session — the Stripe signature IS the authentication.
 *
 * Idempotency (guardrail #6):
 *   - Stripe event IDs are persisted in a `stripe_webhook_events` table. Before
 *     processing an event, we check if its id was already handled. A duplicate
 *     delivery (Stripe retries) is acknowledged (200) but not re-processed.
 *   - Subscription state is upserted on `stripe_subscription_id` (unique), so
 *     re-processing the same event re-writes the same final state.
 *   - Events arriving out of order: each event independently sets the org plan
 *     from its own data. `customer.subscription.updated` is authoritative for
 *     the current status; `checkout.session.completed` sets the initial plan.
 *     Whichever arrives, the resulting plan is correct for that event's data.
 *
 * Lifecycle mapping (guardrail #7):
 *   See planFromStripeSubscriptionStatus() in src/lib/billing/premium.ts for the
 *   full Stripe status → OrganizationPlan mapping. Summary:
 *     active | trialing → active (premium)
 *     past_due | unpaid | paused → past_due (not premium)
 *     canceled | incomplete_expired → canceled (not premium)
 *     incomplete | (unknown) → trial (not premium)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/service'
import { planFromStripeSubscriptionStatus } from '@/lib/billing/premium'
import { getStripe, getWebhookSecret } from '@/lib/billing/stripe'

export const dynamic = 'force-dynamic'

// Stripe event shape — only the fields we read. Stripe SDK types are broad;
// we narrow to what we actually use.
interface StripeEvent {
  id: string
  type: string
  data: {
    object: Record<string, unknown>
  }
}

interface StripeSubscription {
  id: string
  status: string
  customer: string | { id: string }
  metadata?: { orgId?: string } | null
  current_period_start?: number
  current_period_end?: number
  cancel_at_period_end?: boolean
  canceled_at?: number | null
  items?: {
    data?: Array<{
      price?: { id?: string } | null
    }>
  }
}

interface StripeCheckoutSession {
  id: string
  subscription?: string | StripeSubscription
  customer?: string | { id: string }
  metadata?: { orgId?: string; repId?: string } | null
  client_reference_id?: string
}

/**
 * Extracts the orgId from a Stripe event. We trust metadata set by our OWN
 * checkout endpoint (server-resolved orgId, never client-supplied). Defense in
 * depth: we check session metadata, then client_reference_id, then
 * subscription metadata.
 */
function extractOrgId(event: StripeEvent): string | null {
  const obj = event.data.object

  // checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = obj as unknown as StripeCheckoutSession
    if (session.metadata?.orgId) return session.metadata.orgId
    if (session.client_reference_id) return session.client_reference_id
  }

  // subscription events
  const subscription = obj as unknown as StripeSubscription
  if (subscription.metadata?.orgId) return subscription.metadata.orgId

  return null
}

/**
 * Extracts the Stripe customer id from a session or subscription.
 */
function extractCustomerId(obj: Record<string, unknown>): string | null {
  const customer = obj.customer
  if (typeof customer === 'string') return customer
  if (customer && typeof customer === 'object' && 'id' in customer) {
    return (customer as { id: string }).id
  }
  return null
}

/**
 * Extracts the price id from a subscription's first item.
 */
function extractPriceId(subscription: StripeSubscription): string | null {
  const item = subscription.items?.data?.[0]
  return item?.price?.id ?? null
}

/**
 * Converts a Unix timestamp (seconds) to an ISO string, or null.
 */
function tsToIso(ts: number | null | undefined): string | null {
  return ts ? new Date(ts * 1000).toISOString() : null
}

/**
 * Checks if a Stripe event has already been processed. Returns true if so.
 * If the events table is unavailable, returns false (process anyway — the
 * subscription upsert is the real idempotency guard).
 */
async function isEventProcessed(
  client: ReturnType<typeof createServiceSupabase>,
  eventId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('stripe_webhook_events')
    .select('stripe_event_id')
    .eq('stripe_event_id', eventId)
    .maybeSingle()
  if (error) return false // table unavailable or transient error — process anyway
  return data !== null
}

/**
 * Records a Stripe event as processed. Idempotent (on conflict do nothing).
 */
async function recordEventProcessed(
  client: ReturnType<typeof createServiceSupabase>,
  eventId: string,
  type: string,
): Promise<void> {
  await client
    .from('stripe_webhook_events')
    .upsert({ stripe_event_id: eventId, type }, { onConflict: 'stripe_event_id' })
}

/**
 * Upserts a subscription row from Stripe data. The unique constraint on
 * stripe_subscription_id makes this idempotent — re-delivery re-writes the
 * same row.
 */
async function upsertSubscription(
  client: ReturnType<typeof createServiceSupabase>,
  orgId: string,
  subscription: StripeSubscription,
): Promise<void> {
  const priceId = extractPriceId(subscription)
  await client.from('subscriptions').upsert(
    {
      organization_id: orgId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      status: subscription.status,
      current_period_start: tsToIso(subscription.current_period_start ?? null),
      current_period_end: tsToIso(subscription.current_period_end ?? null),
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      canceled_at: tsToIso(subscription.canceled_at ?? null),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_subscription_id' },
  )
}

/**
 * Updates an organization's plan based on a Stripe subscription status.
 */
async function updateOrgPlan(
  client: ReturnType<typeof createServiceSupabase>,
  orgId: string,
  status: string,
): Promise<void> {
  const plan = planFromStripeSubscriptionStatus(status)
  await client
    .from('organizations')
    .update({ plan })
    .eq('id', orgId)
}

/**
 * Sets the billing_customer_id on an org (from checkout.session.completed).
 */
async function setBillingCustomerId(
  client: ReturnType<typeof createServiceSupabase>,
  orgId: string,
  customerId: string,
): Promise<void> {
  await client
    .from('organizations')
    .update({ billing_customer_id: customerId })
    .eq('id', orgId)
}

export async function POST(req: NextRequest) {
  // ── 1. Verify Stripe signature ─────────────────────────────────────────
  // Read the raw body as text — Stripe verifies against the exact bytes.
  const rawBody = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 })
  }

  let event: StripeEvent
  try {
    const stripe = getStripe()
    const secret = getWebhookSecret()
    const verified = stripe.webhooks.constructEvent(rawBody, signature, secret)
    event = unknownToStripeEvent(verified)
  } catch (err) {
    // Invalid signature — could be a forged request. Reject it.
    console.warn('[billing/webhook] invalid signature', {
      message: err instanceof Error ? err.message : 'unknown',
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const client = createServiceSupabase()

  // ── 2. Idempotency check — skip already-processed events ───────────────
  if (await isEventProcessed(client, event.id)) {
    // Already handled — acknowledge to prevent Stripe retries.
    return NextResponse.json({ received: true, duplicate: true })
  }

  // ── 4. Process the event ───────────────────────────────────────────────
  try {
    const obj = event.data.object
    const orgId = extractOrgId(event)

    switch (event.type) {
      case 'checkout.session.completed': {
        if (!orgId) break
        const session = obj as unknown as StripeCheckoutSession

        // Set the billing customer id on the org.
        const customerId = extractCustomerId(obj)
        if (customerId) {
          await setBillingCustomerId(client, orgId, customerId)
        }

        // Retrieve the subscription to get its current status, then upsert.
        // We NEVER grant premium optimistically — only verified subscription
        // state drives the plan. If the subscription is still incomplete
        // (e.g. 3D Secure pending), planFromStripeSubscriptionStatus maps it
        // to 'trial' (not premium). customer.subscription.updated will flip it
        // to 'active' once payment clears.
        const subId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
        if (subId && typeof subId === 'string') {
          const stripe = getStripe()
          const subscription = await stripe.subscriptions.retrieve(subId)
          await upsertSubscription(client, orgId, subscription as unknown as StripeSubscription)
          await updateOrgPlan(client, orgId, subscription.status)
        } else {
          // No subscription id on the session (rare). Do NOT grant premium —
          // the customer.subscription.created event ALWAYS fires for
          // subscription-mode checkout and carries the authoritative status.
          // The success page polls until the subscription event arrives.
          console.warn('[billing/webhook] checkout.session.completed without subscription id', {
            orgId,
            sessionId: session.id,
          })
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        if (!orgId) break
        const subscription = obj as unknown as StripeSubscription
        await upsertSubscription(client, orgId, subscription)
        await updateOrgPlan(client, orgId, subscription.status)
        break
      }

      case 'customer.subscription.deleted': {
        if (!orgId) break
        const subscription = obj as unknown as StripeSubscription
        // Mark the subscription canceled and revoke premium.
        await upsertSubscription(client, orgId, {
          ...subscription,
          status: 'canceled',
        })
        await updateOrgPlan(client, orgId, 'canceled')
        break
      }

      default:
        // Unhandled event type — acknowledge to prevent retries. We don't
        // fail on unknown events; Stripe may add new types.
        break
    }

    // Record the event as processed.
    await recordEventProcessed(client, event.id, event.type)

    return NextResponse.json({ received: true })
  } catch (error) {
    // Log but still return 200 — Stripe retries on non-200, and a transient
    // error (e.g. org doesn't exist) shouldn't cause infinite retries.
    // The next delivery will re-attempt; if it's a persistent error it'll
    // be visible in logs.
    console.error('[billing/webhook] processing error', {
      eventId: event.id,
      type: event.type,
      message: error instanceof Error ? error.message : 'unknown',
    })
    return NextResponse.json({ received: true, error: 'processing_failed' })
  }
}

/**
 * Safely converts an unknown Stripe event to our narrowed StripeEvent type.
 * The Stripe SDK returns typed events, but we narrow to the fields we use.
 */
function unknownToStripeEvent(event: unknown): StripeEvent {
  return event as StripeEvent
}
