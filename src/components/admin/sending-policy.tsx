'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus, Save } from 'lucide-react'
import { cn } from 'cn'

export interface SendingPolicyInitial {
  enabled: boolean
  autonomyMode: 'MANUAL' | 'APPROVAL_REQUIRED' | 'AUTOPILOT'
  linkedinAutonomyMode: 'MANUAL' | 'APPROVAL_REQUIRED' | 'AUTOPILOT'
  upworkAutonomyMode: 'MANUAL' | 'APPROVAL_REQUIRED' | 'AUTOPILOT'
  dailySendCap: number
  hourlySendCap: number
  minimumSpacingMinutes: number
  workingHoursStart: number
  workingHoursEnd: number
  followUpLimit: number
  consecutiveFailureThreshold: number
  bounceThresholdPercent: number
}

const AUTONOMY_OPTIONS = ['MANUAL', 'APPROVAL_REQUIRED', 'AUTOPILOT'] as const

/** The fields the stepper may move. Autonomy and enabled are set by choice, not arithmetic. */
type NumericPolicyKey = {
  [K in keyof SendingPolicyInitial]: SendingPolicyInitial[K] extends number ? K : never
}[keyof SendingPolicyInitial]

/**
 * The organization's sending policy — one section, every authority.
 *
 * DM and connection ceilings are edited in the send-budget panel above; this
 * section owns email autonomy, the per-mailbox email ceilings and the safety
 * thresholds. Reads and writes go to `/api/admin/email-policy`, and the values
 * shown are the resolved effective policy, so what an admin sees is what the
 * send path will enforce.
 */
export function SendingPolicy({ initial }: { initial: SendingPolicyInitial }) {
  const router = useRouter()
  const [values, setValues] = useState<SendingPolicyInitial>(initial)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const dirty = JSON.stringify(values) !== JSON.stringify(initial)

  function step(key: NumericPolicyKey, direction: 'up' | 'down', min: number, max: number, stepSize = 1) {
    setValues((current) => ({
      ...current,
      [key]: Math.min(max, Math.max(min, current[key] + (direction === 'up' ? stepSize : -stepSize))),
    }))
    setState('idle')
    setError(null)
  }

  function setAutonomy(key: keyof SendingPolicyInitial, value: SendingPolicyInitial['autonomyMode']) {
    setValues((current) => ({ ...current, [key]: value }))
    setState('idle')
    setError(null)
  }

  async function save() {
    setState('saving')
    setError(null)
    try {
      const response = await fetch('/api/admin/email-policy', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: values.enabled,
          autonomyMode: values.autonomyMode,
          linkedinAutonomyMode: values.linkedinAutonomyMode,
          upworkAutonomyMode: values.upworkAutonomyMode,
          dailySendCap: values.dailySendCap,
          hourlySendCap: values.hourlySendCap,
          minimumSpacingSeconds: values.minimumSpacingMinutes * 60,
          workingHoursStart: values.workingHoursStart,
          workingHoursEnd: values.workingHoursEnd,
          followUpLimit: values.followUpLimit,
          consecutiveFailureThreshold: values.consecutiveFailureThreshold,
          bounceThreshold: Math.max(1, Math.round(values.bounceThresholdPercent / 10)),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(body.error ?? 'Could not save the sending policy.')
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

  const stepper = (
    key: NumericPolicyKey,
    min: number,
    max: number,
    stepSize = 1,
  ) => (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => step(key, 'down', min, max, stepSize)}
        disabled={values[key] <= min}
        aria-label="Decrease"
        className="inline-flex size-8 items-center justify-center rounded-full bg-black/5 text-ink transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-black/10 active:scale-[0.94] disabled:opacity-40 disabled:hover:bg-black/5"
      >
        <Minus className="size-3.5" aria-hidden="true" />
      </button>
      <span className="w-8 text-center text-[13px] font-semibold tabular-nums text-ink">{values[key]}</span>
      <button
        type="button"
        onClick={() => step(key, 'up', min, max, stepSize)}
        disabled={values[key] >= max}
        aria-label="Increase"
        className="inline-flex size-8 items-center justify-center rounded-full bg-black/5 text-ink transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-black/10 active:scale-[0.94] disabled:opacity-40 disabled:hover:bg-black/5"
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )

  const row = (label: string, control: React.ReactNode, hint?: string) => (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <p className="text-[12px] font-medium text-ink">{label}</p>
        {hint && <p className="text-[11px] text-stone">{hint}</p>}
      </div>
      {control}
    </div>
  )

  const autonomyControl = (key: keyof SendingPolicyInitial) => (
    <div className="flex gap-1">
      {AUTONOMY_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setAutonomy(key, option)}
          aria-pressed={values[key] === option}
          className={cn(
            'rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
            values[key] === option
              ? 'border-solid bg-solid text-on-solid'
              : 'border-line text-graphite hover:text-ink',
          )}
        >
          {option === 'APPROVAL_REQUIRED' ? 'Approval' : option === 'AUTOPILOT' ? 'Autopilot' : 'Manual'}
        </button>
      ))}
    </div>
  )

  const group = (title: string, content: React.ReactNode) => (
    <div>
      <p className="pb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-stone">{title}</p>
      <div className="divide-y divide-line/60 rounded-md border border-line bg-bone px-3">{content}</div>
    </div>
  )

  return (
    <section className="rounded-lg border border-line bg-bone-raised" aria-labelledby="sending-policy-heading">
      <div className="border-b border-line px-4 py-3">
        <h2 id="sending-policy-heading" className="flex items-center gap-2 text-[13px] font-medium text-ink">
          Sending policy
        </h2>
        <p className="mt-0.5 text-[11px] text-graphite">
          Every authority Relay enforces. What you set here is what the send path applies.
        </p>
      </div>

      <div className="space-y-4 p-4">
        {group(
          'Email',
          <>
            {row('Daily per mailbox', stepper('dailySendCap', 1, 200), 'Per revenue identity')}
            {row('Hourly', stepper('hourlySendCap', 0, 50), '0 means no separate hourly cap')}
            {row('Minimum spacing', stepper('minimumSpacingMinutes', 1, 120), 'Minutes between two sends from one mailbox')}
            {row('Send window', (
              <div className="flex items-center gap-1 text-[12px] tabular-nums text-ink">
                <span>{String(values.workingHoursStart).padStart(2, '0')}:00</span>
                <span className="text-stone">–</span>
                <span>{String(values.workingHoursEnd).padStart(2, '0')}:00</span>
                <button
                  type="button"
                  onClick={() => step('workingHoursEnd', 'up', 0, 23)}
                  className="ml-1 text-graphite hover:text-ink"
                  aria-label="Extend send window"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ), 'Mailbox local hours')}
            {row('Max follow-ups', stepper('followUpLimit', 0, 10), 'Per lead')}
          </>,
        )}

        {group(
          'Autonomy',
          <>
            {row('Email', autonomyControl('autonomyMode'), 'Drafts are held for a human unless autopilot is safe')}
            {row('LinkedIn', autonomyControl('linkedinAutonomyMode'))}
            {row('Upwork', autonomyControl('upworkAutonomyMode'))}
          </>,
        )}

        {group(
          'Safety',
          <>
            {row('Pause after failures', stepper('consecutiveFailureThreshold', 1, 10), 'Consecutive provider failures before the mailbox is degraded')}
            {row('Bounce threshold', stepper('bounceThresholdPercent', 10, 100, 10), 'Percent of bounced sends that pauses a mailbox')}
          </>,
        )}

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
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] disabled:opacity-60"
          >
            <Save className="size-3.5" aria-hidden="true" />
            {state === 'saving' ? 'Saving…' : 'Save sending policy'}
          </button>
          <span aria-live="polite" className="text-[12px] text-graphite">
            {state === 'saved' ? 'Saved. The next send uses these limits.' : ''}
          </span>
        </div>
      </div>
    </section>
  )
}
