'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'

/**
 * Client component that renders the "Cancel Premium" action with a two-step
 * confirmation dialog. The actual cancellation is performed server-side by
 * POST /api/billing/cancel — this component only sends the request after the
 * user confirms. It never modifies the plan locally; the parent page reads
 * plan fresh from the server on the next navigation/poll.
 *
 * Props:
 *   periodEnd - ISO string of the current billing period end (optional). If
 *               provided, shown so the user knows when access ends.
 */
export function CancelPremium({ periodEnd }: { periodEnd?: string | null }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleCancel() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to cancel subscription.')
        setLoading(false)
        return
      }
      setDone(true)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  // Success state: cancellation requested. The webhook will finalize the plan
  // change; we show the period end so the user knows when access ends.
  if (done) {
    return (
      <div className="rounded-lg border border-orange/30 bg-orange/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-orange" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[13px] font-medium text-ink">Premium cancellation scheduled</p>
            <p className="text-[12px] text-graphite">
              Your Premium subscription will cancel at the end of the current billing period
              {periodEnd ? (
                <> ({new Date(periodEnd).toLocaleDateString()})</>
              ) : (
                ''
              )}
              . You retain Premium access until then.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-line bg-bone-raised shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        <AlertTriangle className="size-4 text-stone" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-[12px] text-graphite">Premium subscription</p>
          <p className="text-[14px] font-medium text-ink">Manage Premium</p>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:border-ink hover:text-ink"
        >
          Cancel Premium
        </button>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Cancel Premium confirmation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirming(false)
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-line bg-bone p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-orange" aria-hidden="true" />
                <h2 className="text-[16px] font-medium text-ink">Cancel Premium?</h2>
              </div>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md p-1 text-stone transition-colors hover:text-ink"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="mt-3 text-[13px] text-graphite">
              Your Premium subscription will be canceled at the end of the current billing
              period
              {periodEnd ? (
                <> (<span className="font-medium text-ink">{new Date(periodEnd).toLocaleDateString()}</span>)</>
              ) : (
                ''
              )}
              . After that, your organization will revert to the Free plan and
              Premium features will be disabled.
            </p>
            <p className="mt-2 text-[13px] text-graphite">
              You can resubscribe anytime from the{' '}
              <span className="font-medium text-ink">View plans</span> page.
            </p>

            {error && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700" role="alert">
                {error}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={loading}
                className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:bg-surface-muted disabled:opacity-50"
              >
                Keep Premium
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-md bg-orange px-3 py-1.5 text-[12px] font-medium text-on-accent transition-colors hover:bg-orange/90 disabled:opacity-50"
              >
                {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                {loading ? 'Canceling…' : 'Confirm cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
