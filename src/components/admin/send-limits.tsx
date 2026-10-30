'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus, Save } from 'lucide-react'
import { cn } from 'cn'
import {
  SEND_LIMIT_KEYS,
  SEND_LIMIT_LABELS,
  SEND_LIMIT_MAX,
  SEND_LIMIT_MIN,
  nextSendLimit,
  type SendLimitKey,
  type SendLimits,
} from '@/lib/email/send-limits'

/**
 * Organization send limits — admin only.
 *
 * These are the ceilings the send path enforces, so this panel is the one place
 * they are changed. A rep cannot raise their own ceiling: the route rejects a
 * non-admin, and this panel is rendered only for admins.
 *
 * The value shown is the resolved limit (org override, else env, else default),
 * which is the same number `dailySendLimit` returns at send time.
 */
export function SendLimits({ initial }: { initial: SendLimits }) {
  const router = useRouter()
  const [limits, setLimits] = useState<SendLimits>(initial)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const dirty = SEND_LIMIT_KEYS.some((key) => limits[key] !== initial[key])

  function step(key: SendLimitKey, direction: 'up' | 'down') {
    setLimits((current) => ({ ...current, [key]: nextSendLimit(current[key], direction) }))
    setState('idle')
    setError(null)
  }

  async function save() {
    setState('saving')
    setError(null)
    try {
      const response = await fetch('/api/admin/send-limits', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(limits),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(body.error ?? 'Could not save the send limits.')
        setState('error')
        return
      }
      setState('saved')
      router.refresh()
    } catch {
      setError('Network error. Nothing was changed.')
      setState('error')
    }
  }

  return (
    <section className="rounded-lg border border-line bg-bone-raised" aria-labelledby="send-limits-heading">
      <div className="border-b border-line px-4 py-3">
        <h2 id="send-limits-heading" className="flex items-center gap-2 text-[13px] font-medium text-ink">
          Send limits
        </h2>
        <p className="mt-0.5 text-[11px] text-graphite">
          The ceilings the send path enforces. Changing one changes what every rep can send today.
        </p>
      </div>

      <div className="space-y-3 p-4">
        {SEND_LIMIT_KEYS.map((key) => {
          const value = limits[key]
          const atMin = value <= SEND_LIMIT_MIN
          const atMax = value >= SEND_LIMIT_MAX

          return (
            <div key={key} className="rounded-md border border-line bg-bone px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-medium text-ink">{SEND_LIMIT_LABELS[key]}</span>
                <span className="text-[13px] font-semibold tabular-nums text-ink">{value}</span>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => step(key, 'down')}
                  disabled={atMin}
                  aria-label={`Decrease ${SEND_LIMIT_LABELS[key]} limit`}
                  className="inline-flex size-8 items-center justify-center rounded-full bg-black/5 text-ink transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-black/10 active:scale-[0.94] disabled:opacity-40 disabled:hover:bg-black/5"
                >
                  <Minus className="size-3.5" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => step(key, 'up')}
                  disabled={atMax}
                  aria-label={`Increase ${SEND_LIMIT_LABELS[key]} limit`}
                  className="inline-flex size-8 items-center justify-center rounded-full bg-black/5 text-ink transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-black/10 active:scale-[0.94] disabled:opacity-40 disabled:hover:bg-black/5"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </button>

                <span className="ml-auto text-[11px] tabular-nums text-stone">
                  {SEND_LIMIT_MIN}–{SEND_LIMIT_MAX} per day
                </span>
              </div>
            </div>
          )
        })}

        {error && (
          <p className="rounded-md border border-status-danger/30 bg-status-danger/[0.04] px-3 py-2 text-[12px] text-status-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || state === 'saving'}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-md bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] disabled:opacity-60',
            )}
          >
            <Save className="size-3.5" aria-hidden="true" />
            {state === 'saving' ? 'Saving…' : 'Save limits'}
          </button>
          <span aria-live="polite" className="text-[12px] text-graphite">
            {state === 'saved' ? 'Saved. The new ceilings apply to the next send.' : ''}
          </span>
        </div>
      </div>
    </section>
  )
}
