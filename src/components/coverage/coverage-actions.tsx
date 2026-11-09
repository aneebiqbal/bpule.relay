'use client'

/**
 * Coverage actions for one channel — the only place a coverage exception is
 * resolved. The plan is the authority: the server derives the recommended
 * covering rep, and a client can only approve or restore what it derived.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface CoveragePending {
  kind: 'COVER' | 'RESTORE_PRIMARY'
  fromRepName: string
  toRepName: string
  reason: string
}

export function CoverageActions({
  profileId,
  pending,
  active,
}: {
  profileId: string
  pending: CoveragePending | null
  active: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!pending && !active) return null

  async function approve() {
    if (!pending) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/team/coverage/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ profileId, kind: pending.kind }] }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Coverage could not be applied.')
        return
      }
      setNotice(pending.kind === 'RESTORE_PRIMARY' ? 'Primary restored.' : 'Cover approved.')
      router.refresh()
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function restore() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/team/coverage/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, returnOpenTasks: true, reason: 'Primary is available again' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Coverage could not be restored.')
        return
      }
      setNotice('Primary restored.')
      router.refresh()
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const label = pending
    ? pending.kind === 'RESTORE_PRIMARY'
      ? `Restore ${pending.toRepName}`
      : `Approve cover by ${pending.toRepName}`
    : 'Restore primary'

  return (
    <div className="mt-4 border-t border-line/70 pt-4">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Coverage</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (pending ? void approve() : void restore())}
          disabled={busy}
          className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? 'Saving…' : label}
        </button>
        {pending && <span className="text-[12px] text-graphite">{pending.reason}</span>}
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-[12px] text-graphite">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-2 rounded-lg border border-status-success/30 bg-status-success/5 px-3 py-2 text-[12px] text-graphite">
          {notice}
        </p>
      )}
    </div>
  )
}
