'use client'

/**
 * Coverage actions for one channel — the only place a coverage exception is
 * resolved. The plan is the authority: the server derives the recommended
 * covering rep, and a client can only approve or restore what it derived.
 *
 * The execution mode is chosen here and is explicit: SHARED keeps the primary
 * working alongside the covering rep; REPLACE pauses the primary's execution
 * while ownership stays unchanged.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from 'cn'

export interface CoveragePending {
  kind: 'COVER' | 'RESTORE_PRIMARY'
  fromRepName: string
  toRepName: string
  reason: string
}

type Mode = 'SHARED' | 'REPLACE'

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
  const [mode, setMode] = useState<Mode>('REPLACE')

  if (!pending && !active) return null

  const restoring = pending?.kind === 'RESTORE_PRIMARY'

  async function approve() {
    if (!pending) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/team/coverage/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ profileId, kind: pending.kind, mode }],
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Coverage could not be applied.')
        return
      }
      setNotice(restoring ? 'Primary restored.' : 'Cover approved.')
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
    ? restoring
      ? `Restore ${pending.toRepName}`
      : `Approve cover by ${pending.toRepName}`
    : 'Restore primary'

  return (
    <div className="mt-4 border-t border-line/70 pt-4">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Coverage</p>

      {pending && !restoring && (
        <fieldset className="mb-3">
          <legend className="mb-1.5 text-[12px] font-medium text-ink">
            How should this coverage work?
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ModeOption
              mode="SHARED"
              current={mode}
              onSelect={setMode}
              title="Shared responsibility"
              description="Primary continues working. Both reps can operate this profile."
            />
            <ModeOption
              mode="REPLACE"
              current={mode}
              onSelect={setMode}
              title="Replace primary temporarily"
              description="Covering rep works the profile. Primary keeps ownership but execution is paused."
            />
          </div>
        </fieldset>
      )}

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

function ModeOption({
  mode,
  current,
  onSelect,
  title,
  description,
}: {
  mode: Mode
  current: Mode
  onSelect: (mode: Mode) => void
  title: string
  description: string
}) {
  const checked = current === mode
  return (
    <label
      className={cn(
        'cursor-pointer rounded-xl px-3 py-2.5 ring-1 transition-colors',
        checked ? 'bg-bone-raised ring-solid' : 'bg-bone ring-line/70 hover:bg-bone-raised',
      )}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name="coverage-mode"
          value={mode}
          checked={checked}
          onChange={() => onSelect(mode)}
          className="size-3.5 accent-current"
        />
        <span className="text-[12px] font-medium text-ink">{title}</span>
      </span>
      <span className="mt-1 block pl-5 text-[11px] leading-relaxed text-stone">{description}</span>
    </label>
  )
}
