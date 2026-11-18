'use client'

/**
 * Channel lifecycle editor.
 *
 * Shows the current state, the valid transitions from it, a mandatory reason
 * for anything other than reactivation, and requires an explicit confirm.
 * The server re-validates the transition and audits it.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from 'cn'
import { ChannelBadge } from '@/components/ui/channel-badge'
import type { IdentityLifecycleStatus } from '@/lib/profiles/lifecycle'

const LABELS: Record<IdentityLifecycleStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
}

const NEXT: Record<IdentityLifecycleStatus, IdentityLifecycleStatus[]> = {
  ACTIVE: ['INACTIVE', 'SUSPENDED', 'ARCHIVED'],
  INACTIVE: ['ACTIVE', 'SUSPENDED', 'ARCHIVED'],
  SUSPENDED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['ACTIVE'],
}

export function LifecycleDialog({
  identityId,
  identityName,
  channel,
  status,
  onClose,
}: {
  identityId: string
  identityName: string
  channel: string
  status: string
  onClose: () => void
}) {
  const router = useRouter()
  const current = (status.toUpperCase() as IdentityLifecycleStatus) ?? 'ACTIVE'
  const [target, setTarget] = useState<IdentityLifecycleStatus | null>(null)
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    setTarget(null)
    setReason('')
    setConfirm(false)
    setError(null)
  }, [identityId])

  const needsReason = target !== null && target !== 'ACTIVE'
  const canApply = target !== null && confirm && !busy && (!needsReason || reason.trim().length > 0)

  async function apply() {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/identities/${identityId}/lifecycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: target, reason, confirm: true }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}). Please retry.`)
      setDone(`${LABELS[current]} → ${LABELS[target]}`)
      router.refresh()
      window.setTimeout(onClose, 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the channel.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Channel status for ${identityName}`}
    >
      <div className="w-full max-w-md rounded-xl border border-line bg-bone-raised p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-medium text-ink">Channel status</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-stone">
              <span className="truncate">{identityName}</span>
              <span>·</span>
              <ChannelBadge channel={channel} />
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-[12px] text-stone hover:text-ink"
          >
            ✕
          </button>
        </div>

        <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
          Current: {LABELS[current]}
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {NEXT[current].map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={target === option}
              onClick={() => setTarget(option)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                target === option ? 'border-line bg-bone text-ink' : 'border-line/70 text-graphite hover:text-ink',
              )}
            >
              {LABELS[option]}
            </button>
          ))}
        </div>

        {needsReason && (
          <label className="mt-3 block">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Reason</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Why is this channel changing state?"
              className="mt-1 w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink placeholder:text-stone"
            />
          </label>
        )}

        <p className="mt-2 text-[11px] text-stone">
          Non-active channels stay visible to admins but are removed from every operator workspace, so they
          cannot be executed.
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-[12px] text-graphite">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-graphite">
            <input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} className="size-4 accent-orange" />
            Confirm this status change
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-graphite"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={!canApply}
              className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? 'Applying…' : done ? 'Saved ✓' : 'Apply status'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
