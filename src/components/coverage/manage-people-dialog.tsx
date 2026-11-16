'use client'

/**
 * Manage people — the one dialog for a channel's responsibility chain.
 *
 * THREE distinct seats, never one overloaded "assign":
 *   PRIMARY OWNER  — owns the profile of record. Exactly one.
 *   ACTIVE OPERATOR — works the channel's ONE shared plan; counted separately.
 *   BACKUP         — eligibility only. Never executes unless coverage activates.
 *
 * The flow is edit → review → confirm. The review step shows the exact
 * before/after diff, so an admin never removes an operator by accident and a
 * bulk edit is always previewed before it is persisted. Saving reconciles the
 * whole chain in one canonical call; the channel's daily plan is never read or
 * written here.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import { diffPeopleChain, type ChainSeat } from './people-chain-diff'

interface Seat {
  repId: string
  repName: string
  priority?: number
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function ManagePeopleDialog({
  profileId,
  identityName,
  channel,
  primaryRepId,
  operators,
  backups,
  reps,
  onClose,
}: {
  profileId: string
  identityName: string
  channel: string
  primaryRepId: string | null
  operators: Seat[]
  backups: Seat[]
  reps: Array<{ id: string; name: string }>
  onClose: () => void
}) {
  const router = useRouter()
  const [step, setStep] = useState<'edit' | 'review'>('edit')
  const [query, setQuery] = useState('')
  const [primary, setPrimary] = useState(primaryRepId ?? '')
  const [operatorIds, setOperatorIds] = useState<string[]>(operators.map((row) => row.repId))
  const [backupIds, setBackupIds] = useState<string[]>(backups.map((row) => row.repId))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameById = useMemo(() => new Map(reps.map((rep) => [rep.id, rep.name])), [reps])
  const nameOf = (id: string) => nameById.get(id) ?? 'Unknown'
  const available = reps.filter((rep) => rep.id !== primary)
  const needle = query.trim().toLowerCase()
  const visibleReps = needle
    ? available.filter((rep) => rep.name.toLowerCase().includes(needle))
    : available

  const draft = { primary, operatorIds, backupIds }
  const diff = diffPeopleChain({ primaryRepId, operators, backups }, draft)
  const allOperatorIds = available.map((rep) => rep.id)

  function toggleOperator(repId: string) {
    setOperatorIds((current) =>
      current.includes(repId) ? current.filter((id) => id !== repId) : [...current, repId],
    )
  }

  function setAllOperators(next: boolean) {
    setOperatorIds(next ? allOperatorIds : [])
  }

  function toggleBackup(repId: string) {
    setBackupIds((current) =>
      current.includes(repId) ? current.filter((id) => id !== repId) : [...current, repId],
    )
  }

  function move(index: number, delta: number) {
    setBackupIds((current) => {
      const next = [...current]
      const target = index + delta
      if (target < 0 || target >= next.length) return current
      const [row] = next.splice(index, 1)
      next.splice(target, 0, row)
      return next
    })
  }

  function startReview() {
    if (!primary) {
      setError('Choose a primary owner.')
      return
    }
    setError(null)
    setStep('review')
  }

  async function save() {
    if (!primary) {
      setError('Choose a primary owner.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/team/profiles/${profileId}/coverage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryRepId: primary,
          operators: operatorIds
            .filter((id) => id !== primary)
            .map((id, index) => ({ repId: id, priority: index + 1 })),
          backups: backupIds
            .filter((id) => id !== primary && !operatorIds.includes(id))
            .map((id, index) => ({ repId: id, priority: index + 1 })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not save the team.')
      setSaved(true)
      router.refresh()
      window.setTimeout(() => onClose(), 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the team.')
    } finally {
      setSaving(false)
    }
  }

  const seatLine = (seat: ChainSeat, role: string) => (
    <li key={seat.repId} className="flex items-center gap-2 rounded-lg bg-bone px-2 py-1.5">
      <span className="flex size-6 items-center justify-center rounded-full bg-bone-raised text-[10px] font-medium text-graphite">
        {initials(seat.repName)}
      </span>
      <span className="flex-1 text-[13px] text-ink">{seat.repName}</span>
      <span className="text-[10px] uppercase tracking-[0.12em] text-stone">{role}</span>
    </li>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Manage people for ${identityName}`}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-bone-raised p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-medium text-ink">Manage people</h3>
            <p className="mt-0.5 text-[12px] text-stone">
              {identityName} · {channel}
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

        <div className="mt-3 rounded-lg border border-line bg-bone px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">Current setup</p>
          <ul className="mt-1.5 space-y-1">
            {primaryRepId ? seatLine({ repId: primaryRepId, repName: nameOf(primaryRepId) }, 'Primary') : (
              <li className="text-[12px] text-status-danger">No primary owner</li>
            )}
            {operators.map((seat) => seatLine(seat, 'Operator'))}
            {backups.map((seat) => seatLine(seat, 'Backup'))}
          </ul>
        </div>

        {step === 'edit' ? (
          <div className="mt-4 space-y-5">
            <section>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Primary owner</p>
              <select
                value={primary}
                onChange={(event) => setPrimary(event.target.value)}
                aria-label="Primary owner"
                className="mt-1.5 h-10 w-full rounded-lg border border-line bg-bone px-3 text-[13px] text-ink"
              >
                <option value="">Select a rep</option>
                {reps.map((rep) => (
                  <option key={rep.id} value={rep.id}>{rep.name}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-stone">
                Owns the profile of record. Changing this never moves the daily plan.
              </p>
            </section>

            <section>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Active operators</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAllOperators(true)}
                    className="text-[11px] text-graphite underline-offset-2 hover:underline"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllOperators(false)}
                    className="text-[11px] text-graphite underline-offset-2 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <label className="mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-bone px-2">
                <Search className="size-3.5 text-stone" aria-hidden />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search operators…"
                  aria-label="Search operators"
                  className="h-9 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-stone"
                />
              </label>
              <ul className="mt-1.5 space-y-1">
                {visibleReps.length === 0 && (
                  <li className="text-[12px] text-stone">
                    {available.length === 0 ? 'No other reps in this organization.' : 'No reps match that search.'}
                  </li>
                )}
                {visibleReps.map((rep) => {
                  const checked = operatorIds.includes(rep.id)
                  return (
                    <li key={rep.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-ink hover:bg-bone">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOperator(rep.id)}
                          className="size-4 accent-orange"
                        />
                        <span className="flex size-6 items-center justify-center rounded-full bg-bone-raised text-[10px] font-medium text-graphite">
                          {initials(rep.name)}
                        </span>
                        <span className="flex-1">{rep.name}</span>
                        {checked && <span className="text-[11px] text-graphite">EXECUTES</span>}
                      </label>
                    </li>
                  )
                })}
              </ul>
              {needle && (
                <p className="mt-1 text-[11px] text-stone">
                  Showing {visibleReps.length} of {available.length} reps.
                </p>
              )}
              <p className="mt-1 text-[11px] text-stone">
                Works the channel&apos;s one shared plan. Their contribution is counted separately.
              </p>
            </section>

            <section>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Backups</p>
              {backupIds.length === 0 ? (
                <p className="mt-1.5 text-[12px] text-stone">No backups configured.</p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {backupIds.map((repId, index) => (
                    <li key={repId} className="flex items-center gap-2 rounded-lg bg-bone px-2 py-1.5">
                      <span className="w-4 text-[11px] tabular-nums text-stone">{index + 1}</span>
                      <span className="flex-1 text-[13px] text-ink">{nameOf(repId)}</span>
                      <button
                        type="button"
                        aria-label={`Move backup ${index + 1} up`}
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        className="rounded-md border border-line p-1 text-graphite hover:bg-bone-raised disabled:opacity-40"
                      >
                        <ChevronUp className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move backup ${index + 1} down`}
                        onClick={() => move(index, 1)}
                        disabled={index === backupIds.length - 1}
                        className="rounded-md border border-line p-1 text-graphite hover:bg-bone-raised disabled:opacity-40"
                      >
                        <ChevronDown className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove backup ${index + 1}`}
                        onClick={() => toggleBackup(repId)}
                        className="rounded-md border border-line px-2 py-1 text-[11px] text-graphite hover:bg-bone-raised"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2">
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value) toggleBackup(event.target.value)
                  }}
                  className="h-9 w-full rounded-lg border border-line bg-bone px-2 text-[13px] text-ink"
                  aria-label="Add a backup"
                >
                  <option value="">Add a backup…</option>
                  {available
                    .filter((rep) => !backupIds.includes(rep.id) && !operatorIds.includes(rep.id))
                    .map((rep) => (
                      <option key={rep.id} value={rep.id}>{rep.name}</option>
                    ))}
                </select>
              </div>
              <p className="mt-1 text-[11px] text-stone">
                Eligibility only. A backup never executes unless temporary coverage activates them.
              </p>
            </section>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Review changes</p>
            {!diff.changed ? (
              <p className="rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-graphite">
                No changes. The current setup will be preserved exactly.
              </p>
            ) : (
              <ul className="space-y-1.5 text-[13px]">
                {diff.primary.changed && (
                  <li className="rounded-lg border border-line bg-bone px-3 py-2">
                    <span className="text-stone">Primary: </span>
                    <span className="text-graphite line-through">{diff.primary.from ? nameOf(diff.primary.from) : 'None'}</span>
                    <span className="text-stone"> → </span>
                    <span className="font-medium text-ink">{nameOf(diff.primary.to)}</span>
                  </li>
                )}
                {diff.operators.added.length > 0 && (
                  <li className="rounded-lg border border-line bg-bone px-3 py-2">
                    <span className="text-stone">Operators added: </span>
                    <span className="font-medium text-ink">{diff.operators.added.map(nameOf).join(', ')}</span>
                  </li>
                )}
                {diff.operators.removed.length > 0 && (
                  <li className="rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2">
                    <span className="text-stone">Operators removed: </span>
                    <span className="font-medium text-ink">{diff.operators.removed.map(nameOf).join(', ')}</span>
                  </li>
                )}
                {diff.backups.added.length > 0 && (
                  <li className="rounded-lg border border-line bg-bone px-3 py-2">
                    <span className="text-stone">Backups added: </span>
                    <span className="font-medium text-ink">{diff.backups.added.map(nameOf).join(', ')}</span>
                  </li>
                )}
                {diff.backups.removed.length > 0 && (
                  <li className="rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2">
                    <span className="text-stone">Backups removed: </span>
                    <span className="font-medium text-ink">{diff.backups.removed.map(nameOf).join(', ')}</span>
                  </li>
                )}
                {diff.backups.reordered && (
                  <li className="rounded-lg border border-line bg-bone px-3 py-2">
                    <span className="text-stone">Backup order changed.</span>
                  </li>
                )}
              </ul>
            )}
            <p className="text-[11px] text-stone">
              {diff.changed
                ? 'Confirm to apply exactly these changes. Nothing else on this profile is modified.'
                : 'Confirm to close without writing.'}
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-[12px] text-graphite">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {step === 'edit' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-graphite"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={startReview}
                disabled={!primary}
                className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                Review changes
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('edit')}
                disabled={saving}
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-graphite disabled:opacity-60"
              >
                Back to edit
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || saved}
                className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {saving ? 'Saving…' : saved ? 'Saved ✓' : diff.changed ? 'Confirm & save' : 'Confirm'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
