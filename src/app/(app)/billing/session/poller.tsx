'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { isPremium } from '@/lib/billing/premium'

/**
 * Client component that polls /api/me/billing until the org's plan becomes
 * premium. Shown on the success page only when the Stripe webhook hasn't
 * updated the DB yet. Once the server confirms Premium, redirects to the
 * dashboard (/dashboard) — the final destination after activation.
 *
 * Polls every 3 seconds, up to 20 attempts (~60 seconds). If the webhook
 * hasn't arrived by then, shows a retry/contact message. NEVER grants
 * Premium on timeout — the server remains authoritative.
 */
export function BillingStatusPoller({ session_id }: { session_id?: string }) {
  const [attempts, setAttempts] = useState(0)
  const [active, setActive] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (active) {
      // Premium confirmed by server — redirect to the dashboard. The
      // dashboard reads plan fresh from the DB on each request, so the
      // Premium badge appears immediately without a manual logout.
      window.location.href = '/dashboard'
      return
    }
    if (attempts >= 20) {
      setTimedOut(true)
      return
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/me/billing')
        if (res.ok) {
          const data = await res.json()
          if (isPremium(data.plan)) {
            setActive(true)
          }
        }
      } catch {
        // Network error — keep polling.
      }
      setAttempts((a) => a + 1)
    }, 3000)

    return () => clearInterval(interval)
  }, [attempts, active])

  if (timedOut) {
    return (
      <div className="text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-orange/10">
          <Loader2 className="size-8 animate-spin text-orange" />
        </div>
        <h1 className="mt-4 text-heading text-2xl text-ink">Still processing…</h1>
        <p className="mt-2 text-[15px] text-graphite">
          Your payment is taking longer than expected. Please refresh this page
          to check your subscription status.
        </p>
      </div>
    )
  }

  return (
    <div className="text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-orange/10">
        <Loader2 className="size-8 animate-spin text-orange" />
      </div>
      <h1 className="mt-4 text-heading text-2xl text-ink">Activating Premium…</h1>
      <p className="mt-2 text-[15px] text-graphite">
        Payment successful. We&apos;re confirming your subscription.
        This usually takes a few seconds.
        {session_id && (
          <>
            <br />
            <span className="text-mono-regular text-[11px] text-stone">
              Session: {session_id.slice(0, 12)}…
            </span>
          </>
        )}
      </p>
      <p className="mt-3 text-[12px] text-stone">
        Checking status… ({attempts}/20)
      </p>
    </div>
  )
}
