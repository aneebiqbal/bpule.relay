/**
 * Stripe SDK wrapper. Server-side only — the secret key is never exposed to
 * the browser. The Stripe client is lazily constructed so that merely
 * importing this module does not require the env vars to be set (e.g. in
 * tests that mock this module).
 */
import Stripe from 'stripe'
import type { Organization } from '@/lib/domain/types'
import { createServiceSupabase } from '@/lib/supabase/service'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required Stripe environment variable: ${name}. ` +
        `Set it in .env.local (see .env.local.example for Stripe vars).`,
    )
  }
  return value
}

let _stripe: Stripe | null = null

/**
 * Returns the singleton Stripe client. Throws if STRIPE_SECRET_KEY is not set,
 * so a missing key fails fast with a clear message rather than a cryptic
 * Stripe auth error deep in a request.
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    const secretKey = requireEnv('STRIPE_SECRET_KEY')
    _stripe = new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' })
  }
  return _stripe
}

/**
 * Returns the Stripe webhook secret. Throws if not set.
 */
export function getWebhookSecret(): string {
  return requireEnv('STRIPE_WEBHOOK_SECRET')
}

/**
 * Returns the configured Premium plan Price ID. Throws if not set.
 */
export function getPremiumPriceId(): string {
  return requireEnv('STRIPE_PREMIUM_PRICE_ID')
}

/**
 * Gets the Stripe customer id for an org, creating one if none exists.
 *
 * Uses the service-role client (bypasses RLS) because this is called from the
 * checkout endpoint which runs in a system context. The customer id is
 * persisted back to `organizations.billing_customer_id` so it can be reused.
 *
 * The org's `billing_customer_id` is the source of truth — if it's set we
 * retrieve the customer from Stripe (and it must exist); if not, we create
 * one. We never trust a client-supplied customer id.
 */
export async function findOrCreateCustomer(org: Organization): Promise<string> {
  const stripe = getStripe()

  if (org.billingCustomerId) {
    // Verify the customer still exists on Stripe (it always should unless
    // manually deleted in the Dashboard).
    try {
      await stripe.customers.retrieve(org.billingCustomerId)
      return org.billingCustomerId
    } catch {
      // Customer was deleted on Stripe — fall through to create a new one.
    }
  }

  const customer = await stripe.customers.create({
    name: org.name,
    metadata: { orgId: org.id },
  })

  // Persist the new customer id back to the org for future reuse.
  const service = createServiceSupabase()
  const { error } = await service
    .from('organizations')
    .update({ billing_customer_id: customer.id })
    .eq('id', org.id)
  if (error) {
    // Non-fatal: the checkout can still proceed with the in-memory id, but
    // log so it's visible. The org will get a new customer on the next call
    // if this write failed.
    console.warn('[billing/stripe] failed to persist billing_customer_id', {
      orgId: org.id,
      customerId: customer.id,
      message: error.message,
    })
  }

  return customer.id
}
