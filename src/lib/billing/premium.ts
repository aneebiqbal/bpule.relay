/**
 * Centralized Premium entitlement module.
 *
 * `organizations.plan` is the single source of truth for premium access in
 * Relay. This module is the ONLY place that decides what a given plan is
 * allowed to do. Stores, routes and components consume these functions —
 * they never re-derive limits from the plan string themselves.
 *
 * Stripe is the payment mechanism; it is NOT the entitlement system. Stripe's
 * webhook materializes verified billing state into `organizations.plan`, and
 * from that point on this module governs access. Never grant premium from a
 * Checkout success redirect — only the verified webhook is authoritative.
 */
import type { OrganizationPlan } from '@/lib/domain/types'

/**
 * Sentinel used by the UI when a plan has no ceiling. The store returns this
 * for premium limits; the AppRail renders it as "∞" / hides the ring rather
 * than dividing by it.
 *
 * We use actual `Infinity` (not a large integer) so that content routes can
 * check `limit !== Infinity` to detect the unlimited case, and so that any
 * finite count is always below the limit.
 */
export const UNLIMITED = Infinity

/**
 * Free-plan ceilings. These are the current application limits — preserved as-is,
 * not renumbered to match marketing copy. The pricing page is the public
 * promise; this is the enforced contract.
 *
 *   dailySends: 15 DM/followup sends per day
 *   dailyConnections: 20 connection + Upwork sends per day
 *   studioGenerations: 2 Studio drafts per day (the 4 content routes enforce
 *                      `>= 2`; this matches the actual code behavior. The
 *                      pricing page says "3" but the enforced code limit is 2 —
 *                      we preserve the code, not the docs, per guardrail #2)
 *   prospectChecks: 10 lifetime prospect captures for free orgs (NOTE: this
 *                   limit is NOT currently enforced in code — the prospect
 *                   analyze route captures without any cap. We add enforcement
 *                   as part of the Stripe integration since the pricing page
 *                   promises it. Non-blocking: analysis still returns.)
 */
export const FREE_LIMITS = {
  dailySends: 15,
  dailyConnections: 20,
  studioGenerations: 2,
  prospectChecks: 10,
} as const

/**
 * An organization is premium when its plan is `active`. `trialing` Stripe
 * subscriptions map to `active`, so a Stripe trial grants premium access —
 * this is intentional and documented in `planFromStripeSubscriptionStatus`.
 */
export function isPremium(plan: OrganizationPlan | string | null | undefined): boolean {
  return plan === 'active'
}

/**
 * Daily DM/followup send ceiling for the given plan. Premium: unlimited.
 */
export function dailySendLimit(plan: OrganizationPlan | string | null | undefined): number {
  return isPremium(plan) ? UNLIMITED : FREE_LIMITS.dailySends
}

/**
 * Daily connection + Upwork send ceiling for the given plan. Premium: unlimited.
 */
export function dailyConnectionLimit(plan: OrganizationPlan | string | null | undefined): number {
  return isPremium(plan) ? UNLIMITED : FREE_LIMITS.dailyConnections
}

/**
 * Per-type daily send ceiling. Connection/Upwork use the connection ceiling;
 * everything else uses the DM/followup ceiling. Mirrors the existing
 * `messageTypeLimit` shape in `src/lib/ai/config.ts` but is plan-aware.
 */
export function messageTypeLimitForPlan(
  plan: OrganizationPlan | string | null | undefined,
  type: string,
): number {
  return type === 'connection' || type === 'upwork'
    ? dailyConnectionLimit(plan)
    : dailySendLimit(plan)
}

/**
 * Studio generation ceiling for the given plan. Premium: unlimited. Free: 2
 * (matching the `>= 2` enforced by the 4 content routes — the actual code
 * behavior, not the "3" stated on the pricing page).
 */
export function studioGenerationLimit(plan: OrganizationPlan | string | null | undefined): number {
  return isPremium(plan) ? UNLIMITED : FREE_LIMITS.studioGenerations
}

/**
 * Lifetime prospect-check ceiling for the given plan. Premium: null
 * (unlimited — no cap stored or enforced). Free: 10.
 */
export function prospectCheckLimit(plan: OrganizationPlan | string | null | undefined): number | null {
  return isPremium(plan) ? null : FREE_LIMITS.prospectChecks
}

/**
 * Maps a Stripe subscription status to the OrganizationPlan used for gating.
 *
 * Stripe status → Relay plan:
 *   active | trialing      → active     (live subscription, or Stripe trial — both grant premium)
 *   past_due | unpaid      → past_due   (payment problem — NOT premium)
 *   canceled               → canceled   (ended — NOT premium)
 *   incomplete | incomplete_expired → trial (checkout abandoned/expired — NOT premium)
 *
 * `paused` (rare) maps to past_due — a paused subscription is not active.
 *
 * This mapping is the ONLY place Stripe state becomes Relay entitlement. It is
 * intentionally conservative: any status that isn't a live, paying
 * subscription yields a non-premium plan. We do NOT invent business behavior
 * for edge cases — we fall back to non-premium.
 */
export function planFromStripeSubscriptionStatus(
  status: string | null | undefined,
): OrganizationPlan {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
    case 'paused':
      return 'past_due'
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled'
    case 'incomplete':
    default:
      return 'trial'
  }
}
