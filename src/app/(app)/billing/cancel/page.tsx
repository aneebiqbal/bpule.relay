/**
 * GET /billing/cancel
 *
 * Shown when the user abandons Stripe Checkout. No plan change — the org's
 * plan is whatever it was before (the webhook never fired for an abandoned
 * checkout, so nothing changed server-side).
 */
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function BillingCancelPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6 pt-10">
      <div className="text-center">
        <h1 className="text-heading text-2xl text-ink">Subscription not completed</h1>
        <p className="mt-2 text-[15px] text-graphite">
          You can try again anytime. No charges were made.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/pricing"
          className="flex h-11 items-center justify-center gap-2 rounded-lg bg-orange text-[14px] font-medium text-on-accent transition-all hover:bg-orange-dark"
        >
          Back to pricing
          <ArrowRight className="size-4" />
        </Link>
        <Link
          href="/dashboard"
          className="h-11 rounded-lg border border-line text-[14px] font-medium text-graphite transition-colors hover:text-ink"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
