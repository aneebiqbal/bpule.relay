'use client'

import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'

/**
 * Client component that initiates a Stripe Checkout session by calling the
 * billing API and redirecting to the returned URL. We use a client component
 * because the API returns JSON ({ url }) and we need to redirect client-side.
 *
 * The checkout endpoint derives the org from the authenticated server-side
 * session — we do NOT pass any org or user identity here.
 */
export function CheckoutButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCheckout() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to start checkout.')
        return
      }
      if (data.url) {
        window.location.href = data.url
      } else {
        setError('No checkout URL returned.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleCheckout}
        disabled={loading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-orange text-[14px] font-medium text-on-accent transition-all hover:bg-orange-dark disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            Get Premium
            <ArrowRight className="size-4" />
          </>
        )}
      </button>
      {error && (
        <p className="mt-2 text-[12px] text-status-error">{error}</p>
      )}
    </div>
  )
}
