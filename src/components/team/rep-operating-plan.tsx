'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { activityLabel, defaultTargetsForChannel } from '@/lib/accountability/default-targets'
import { ChannelBadge } from '@/components/ui/channel-badge'
import { ResponsibilityStatus } from '@/components/ui/responsibility-status'
import { channelLabel, normalizeChannel } from '@/lib/profiles/channel'
import type { RepOperatingPlan, OperatingResponsibility } from '@/lib/operations/rep-operating-plan'

/**
 * Rep Operating Plan — the one surface for "who works which channel".
 *
 * Primary responsibilities are grouped by person (channels nested underneath),
 * temporary coverage is shown separately, and every row carries its own
 * assign / transfer / remove actions. Targets are edited through the canonical
 * profile channel editor, never a second target table.
 */

export interface AssignableIdentity {
  id: string
  identityName: string
  channel: string
  profileId: string | null
  personKey: string
  personName: string
  primaryRepId: string | null
  primaryRepName: string | null
}

export function RepOperatingPlanView({
  repId,
  plan,
  identities,
  canManage,
}: {
  repId: string
  plan: RepOperatingPlan
  identities: AssignableIdentity[]
  canManage: boolean
}) {
  const [dialog, setDialog] = useState<
    | { mode: 'assign' }
    | { mode: 'transfer'; row: OperatingResponsibility }
    | { mode: 'remove'; row: OperatingResponsibility }
    | { mode: 'removePlan'; row: OperatingResponsibility }
    | null
  >(null)

  const byPerson = groupByPerson(plan.responsibilities)
  const coveredByPerson = groupByPerson(plan.coverage)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-medium text-ink">Responsibilities</h3>
          <p className="text-[12px] text-stone">
            {plan.responsibilities.length} primary · {plan.today.target} actions/day expected
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setDialog({ mode: 'assign' })}
            className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98]"
          >
            Assign responsibility
          </button>
        )}
      </div>

      {plan.responsibilities.length === 0 && plan.coverage.length === 0 && (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-[13px] text-graphite">
          No responsibilities assigned yet.
        </p>
      )}

      <div className="space-y-3">
        {byPerson.map(([person, rows]) => (
          <div key={person} className="rounded-xl border border-line bg-bone-raised p-3">
            <p className="text-[13px] font-medium text-ink">{person}</p>
            <ul className="mt-2 space-y-2">
              {rows.map((row) => (
                <ResponsibilityRow
                  key={row.identityId}
                  row={row}
                  canManage={canManage}
                  onTransfer={() => setDialog({ mode: 'transfer', row })}
                  onRemove={() => setDialog({ mode: 'remove', row })}
                  onRemovePlan={() => setDialog({ mode: 'removePlan', row })}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {plan.coverage.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
            Temporary coverage
          </p>
          <div className="space-y-3">
            {coveredByPerson.map(([person, rows]) => (
              <div key={person} className="rounded-xl border border-dashed border-line p-3">
                <p className="text-[13px] font-medium text-ink">{person}</p>
                <ul className="mt-2 space-y-2">
                  {rows.map((row) => (
                    <li key={row.identityId} className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[13px] text-ink"><ChannelBadge channel={row.channel} /></p>
                        <p className="text-[11px] text-stone">
                          Covering for {row.coveragePrimaryRepId ?? 'the primary'}
                          {row.coverageUntil ? ` · until ${row.coverageUntil}` : ''}
                        </p>
                      </div>
                      <ResponsibilityStatus status="TEMPORARY" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {canManage && plan.needsSetup.length > 0 && (
        <div className="rounded-xl border border-line bg-bone p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Needs setup</p>
          <ul className="mt-2 space-y-1">
            {plan.needsSetup.map((item) => (
              <li key={item.identityId} className="text-[13px] text-graphite">
                {item.personName} · <ChannelBadge channel={item.channel} /> — {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dialog?.mode === 'assign' && (
        <AssignDialog
          repId={repId}
          plan={plan}
          identities={identities}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.mode === 'transfer' && (
        <TransferDialog row={dialog.row} repId={repId} onClose={() => setDialog(null)} />
      )}
      {dialog?.mode === 'remove' && (
        <RemoveDialog row={dialog.row} repId={repId} onClose={() => setDialog(null)} />
      )}
      {dialog?.mode === 'removePlan' && (
        <RemovePlanDialog row={dialog.row} repId={repId} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}

function groupByPerson(rows: OperatingResponsibility[]): Array<[string, OperatingResponsibility[]]> {
  const map = new Map<string, OperatingResponsibility[]>()
  for (const row of rows) {
    const list = map.get(row.personName) ?? []
    list.push(row)
    map.set(row.personName, list)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

function ResponsibilityRow({
  row,
  canManage,
  onTransfer,
  onRemove,
  onRemovePlan,
}: {
  row: OperatingResponsibility
  canManage: boolean
  onTransfer: () => void
  onRemove: () => void
  onRemovePlan: () => void
}) {
  const summaryLane =
    row.targets.find((target) => target.activityType === 'application') ?? row.targets[0] ?? null
  return (
    <li className="rounded-lg border border-line bg-bone px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1 text-[13px] text-ink">
            <ChannelBadge channel={row.channel} />
            <ResponsibilityStatus
              status={row.role === 'operator' ? 'OPERATOR' : row.role === 'coverage' ? 'TEMPORARY' : 'PRIMARY'}
            />
            {row.isNew && <span className="text-[11px] font-medium text-status-info">NEW</span>}
          </p>
          <p className="text-[11px] text-stone">
            {row.readiness ? 'Ready' : 'Access not confirmed'}
            {row.target > 0
              ? row.role === 'operator' && summaryLane
                ? ` · Profile ${summaryLane.profileCompletedCount}/${summaryLane.targetCount} ${activityLabel(summaryLane.activityType as Parameters<typeof activityLabel>[0])} · Your contribution ${summaryLane.completedCount} · ${Math.max(0, summaryLane.targetCount - summaryLane.profileCompletedCount)} remaining`
                : row.contributorCount > 1
                  ? ` · Profile ${row.profileCompleted}/${row.target} · Your contribution ${row.completed}`
                  : ` · ${row.remaining} of ${row.target} left`
              : ' · No daily plan'}
          </p>
          {row.contributorCount > 1 && (
            <p className="mt-0.5 text-[11px] text-stone">
              Shared requirement · {row.contributorCount} operators
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {row.isNew && (
            <span className="rounded-full bg-orange-faint px-2 py-0.5 text-[11px] font-medium text-orange-ink">NEW</span>
          )}
          {canManage && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onTransfer}
                className="rounded-md border border-line px-2 py-1 text-[11px] text-graphite transition-colors hover:text-ink"
              >
                Transfer
              </button>
              {row.target > 0 && (
                <button
                  type="button"
                  onClick={onRemovePlan}
                  className="rounded-md border border-line px-2 py-1 text-[11px] text-graphite transition-colors hover:text-ink"
                >
                  Remove plan
                </button>
              )}
              {row.role !== 'primary' && (
                <button
                  type="button"
                  onClick={onRemove}
                  className="rounded-md border border-line px-2 py-1 text-[11px] text-graphite transition-colors hover:text-status-danger"
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {row.targets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone">
          {row.targets.map((target) => (
            <span key={target.targetId}>
              {activityLabel(target.activityType as Parameters<typeof activityLabel>[0])}{' '}
              {target.profileCompletedCount}/{target.targetCount}
              {row.contributorCount > 1 ? ` · you ${target.completedCount}` : ''}
            </span>
          ))}
        </div>
      )}
    </li>
  )
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-bone-raised p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-medium text-ink">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md px-2 py-1 text-[12px] text-stone hover:text-ink">
            ✕
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  )
}

function AssignDialog({
  repId,
  plan,
  identities,
  onClose,
}: {
  repId: string
  plan: RepOperatingPlan
  identities: AssignableIdentity[]
  onClose: () => void
}) {
  const router = useRouter()
  const assignedIdentityIds = new Set([
    ...plan.responsibilities.map((row) => row.identityId),
    ...plan.coverage.map((row) => row.identityId),
  ])
  const available = identities.filter((identity) => !assignedIdentityIds.has(identity.id))
  const people = [...new Map(available.map((identity) => [identity.personKey, identity])).values()]

  const [personKey, setPersonKey] = useState('')
  const [identityId, setIdentityId] = useState('')
  const [role, setRole] = useState<'primary' | 'operator' | 'backup'>('primary')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState(false)

  const channels = available.filter((identity) => identity.personKey === personKey)
  const selected = available.find((identity) => identity.id === identityId) ?? null

  // Default to a non-destructive seat. "Primary (owns)" TRANSFERS ownership and
  // retires the current primary, so it must never be the silent default when the
  // identity already has an owner — that is how a second rep appears to "take
  // the profile away" from the first.
  const selectedId = selected?.id ?? ''
  const selectedPrimaryRepId = selected?.primaryRepId ?? null
  useEffect(() => {
    setRole(selectedPrimaryRepId ? 'operator' : 'primary')
  }, [selectedId, selectedPrimaryRepId])
  const pack = defaultTargetsForChannel(normalizeChannel(selected?.channel ?? 'linkedin'))
  const total = pack.reduce((sum, row) => sum + (counts[row.activityType] ?? row.targetCount), 0)

  function startReview() {
    if (!identityId) {
      setError('Select a person and a channel.')
      return
    }
    setError(null)
    setReview(true)
  }

  async function save() {
    if (!identityId) {
      setError('Select a person and a channel.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/responsibilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId, repId, role, ensureTargets: role === 'primary' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not assign the responsibility.')
      // Apply the edited target pack on top of the seeded defaults.
      if (role === 'primary') {
        for (const row of pack) {
          const targetCount = counts[row.activityType] ?? row.targetCount
          if (targetCount <= 0) continue
          await fetch('/api/admin/targets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repId, revenueIdentityId: identityId, activityType: row.activityType, targetCount }),
          })
        }
      }
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign the responsibility.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title={review ? 'Review assignment' : 'Assign people'} onClose={onClose}>
      {review ? (
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-stone">Review assignment</p>
          <dl className="space-y-2 rounded-lg bg-bone px-3 py-2.5 ring-1 ring-line/70">
            <ReviewRow label="Rep" value={plan.repName} />
            <ReviewRow label="Person" value={selected?.personName ?? '—'} />
            <ReviewRow label="Channel" value={selected ? <ChannelBadge channel={selected.channel} /> : '—'} />
            <ReviewRow label="Role" value={role === 'primary' ? 'Primary owner' : role === 'operator' ? 'Active operator' : 'Backup'} />
            {role === 'primary' ? (
              <div>
                {selectedPrimaryRepId && selectedPrimaryRepId !== repId && (
                  <p className="mb-2 rounded-lg border border-status-warning/30 bg-status-warning/10 px-2.5 py-1.5 text-[12px] text-status-warning">
                    This transfers ownership away from {selected?.primaryRepName ?? 'the current primary'}.
                    They keep their history but stop receiving new work.
                  </p>
                )}
                <dt className="text-[11px] uppercase tracking-[0.12em] text-stone">Daily plan</dt>
                <dd className="mt-1 space-y-0.5">
                  {pack.map((row) => (
                    <p key={row.activityType} className="flex justify-between text-[13px] text-ink">
                      <span>{activityLabel(row.activityType)}</span>
                      <span className="tabular-nums">{counts[row.activityType] ?? row.targetCount}</span>
                    </p>
                  ))}
                  <p className="mt-1 flex justify-between border-t border-line/70 pt-1 text-[13px] font-medium text-ink">
                    <span>Total</span>
                    <span className="tabular-nums">{total} actions/day</span>
                  </p>
                </dd>
              </div>
            ) : role === 'operator' ? (
              <div>
                <dt className="text-[11px] uppercase tracking-[0.12em] text-stone">Shared daily plan</dt>
                <dd className="mt-1 text-[13px] text-graphite">
                  The operator works the channel&apos;s existing plan and their contribution is counted
                  separately. Ownership never moves.
                </dd>
              </div>
            ) : (
              <div>
                <dt className="text-[11px] uppercase tracking-[0.12em] text-stone">Backup eligibility only</dt>
                <dd className="mt-1 text-[13px] text-graphite">
                  No daily target. No execution access. Does not appear in My Day unless coverage activates.
                </dd>
              </div>
            )}
            <ReviewRow label="Access" value={`${plan.repName} will be asked to confirm.`} />
          </dl>
          {error && <p role="alert" className="text-[12px] text-status-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setReview(false)}
              className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-graphite"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Assigning…' : 'Confirm assignment'}
            </button>
          </div>
        </div>
      ) : (
      <div className="space-y-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.12em] text-stone">Person</span>
          <select
            value={personKey}
            onChange={(event) => {
              setPersonKey(event.target.value)
              setIdentityId('')
            }}
            className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
          >
            <option value="">Select a person…</option>
            {people.map((identity) => (
              <option key={identity.personKey} value={identity.personKey}>
                {identity.personName}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.12em] text-stone">Channel</span>
          <select
            value={identityId}
            onChange={(event) => setIdentityId(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
          >
            <option value="">Select a channel…</option>
            {channels.map((identity) => (
              <option key={identity.id} value={identity.id}>
                {channelLabel(identity.channel)} · {identity.identityName}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="text-[11px] uppercase tracking-[0.12em] text-stone">Role</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {(['primary', 'operator', 'backup'] as const).map((value) => (
              <label key={value} className="flex items-center gap-1.5 text-[13px] text-ink">
                <input type="radio" checked={role === value} onChange={() => setRole(value)} />
                {value === 'primary' ? 'Primary (owns)' : value === 'operator' ? 'Active operator (shares plan)' : 'Backup (eligibility only)'}
              </label>
            ))}
          </div>
        </div>

        {role === 'primary' && selected && (
          <div>
            <span className="text-[11px] uppercase tracking-[0.12em] text-stone">Daily plan</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {pack.map((row) => (
                <label key={row.activityType} className="block">
                  <span className="text-[11px] text-stone">{activityLabel(row.activityType)}</span>
                  <input
                    type="number"
                    min={0}
                    value={counts[row.activityType] ?? row.targetCount}
                    onChange={(event) => {
                      const parsed = Number(event.target.value)
                      setCounts((current) => ({
                        ...current,
                        [row.activityType]: Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0,
                      }))
                    }}
                    className="mt-0.5 h-8 w-full rounded-md border border-line bg-bone px-2 text-[13px] tabular-nums text-ink"
                  />
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-stone">
              Total {(counts
                ? pack.reduce((sum, row) => sum + (counts[row.activityType] ?? row.targetCount), 0)
                : pack.reduce((sum, row) => sum + row.targetCount, 0))} actions/day
            </p>
          </div>
        )}

        {role === 'backup' && (
          <p className="text-[12px] text-stone">
            A backup can be activated for temporary coverage later. No daily target is created.
          </p>
        )}

        {role === 'operator' && (
          <p className="text-[12px] text-stone">
            The operator works the channel&apos;s existing plan and is counted separately. The primary
            owner does not change.
          </p>
        )}

        <p className="text-[12px] text-stone">
          The rep is asked to confirm access. Access is never marked ready for them.
        </p>

        {error && <p role="alert" className="text-[12px] text-status-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-graphite">
            Cancel
          </button>
          <button
            type="button"
            onClick={startReview}
            disabled={saving}
            className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            Review assignment
          </button>
        </div>
      </div>
      )}
    </Dialog>
  )
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[13px]">
      <dt className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-stone">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{value}</dd>
    </div>
  )
}

function TransferDialog({
  row,
  repId,
  onClose,
}: {
  row: OperatingResponsibility
  repId: string
  onClose: () => void
}) {
  const router = useRouter()
  const [targetRepId, setTargetRepId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!targetRepId) {
      setError('Choose a rep to transfer to.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/responsibilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId: row.identityId, repId: targetRepId, fromRepId: repId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not transfer the responsibility.')
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not transfer the responsibility.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title={`Transfer ${row.personName} · ${channelLabel(row.channel)}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[13px] text-graphite">
          Primary moves from this rep to the selected rep. The daily plan for the channel and its
          completion history stay exactly where they are; lead and message history is unchanged.
        </p>
        <TransferTargetSelect value={targetRepId} onChange={setTargetRepId} />
        {error && <p role="alert" className="text-[12px] text-status-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-graphite">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? 'Transferring…' : 'Transfer'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function TransferTargetSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [reps, setReps] = useState<Array<{ id: string; name: string }>>([])
  const [loaded, setLoaded] = useState(false)
  if (!loaded) {
    setLoaded(true)
    fetch('/api/reps')
      .then((res) => res.json())
      .then((body) => setReps(body.reps ?? []))
      .catch(() => setReps([]))
  }
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.12em] text-stone">Transfer to</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
      >
        <option value="">Select a rep…</option>
        {reps.map((rep) => (
          <option key={rep.id} value={rep.id}>
            {rep.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function RemoveDialog({
  row,
  repId,
  onClose,
}: {
  row: OperatingResponsibility
  repId: string
  onClose: () => void
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/responsibilities', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId: row.identityId, repId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not remove the responsibility.')
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the responsibility.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title={`Remove ${row.personName} · ${channelLabel(row.channel)}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[13px] text-graphite">
          Remove this responsibility from {repId ? 'the rep' : 'the rep'}? This ends execution ownership.
        </p>
        <ul className="space-y-0.5 rounded-lg bg-bone px-3 py-2.5 text-[12px] text-graphite ring-1 ring-line/70">
          <li>The primary assignment is deactivated</li>
          {row.target > 0 && <li>The daily plan for the channel stays; it is not deleted</li>}
          <li>The readiness requirement ends</li>
          <li>Leads, messages and completed work are preserved</li>
        </ul>
        <p className="text-[11px] text-stone">
          Removing a daily plan is different — it keeps the assignment and the profile executable.
        </p>
        {error && <p role="alert" className="text-[12px] text-status-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-graphite">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-status-danger px-3 py-1.5 text-[12px] font-medium text-on-danger transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? 'Removing…' : 'Remove responsibility'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function RemovePlanDialog({
  row,
  repId,
  onClose,
}: {
  row: OperatingResponsibility
  repId: string
  onClose: () => void
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removePlan: true, repId, revenueIdentityId: row.identityId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not remove the daily plan.')
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the daily plan.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title="Remove daily plan?" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[13px] text-ink">
          {row.personName} · {row.channel}
        </p>
        <p className="text-[13px] text-graphite">
          This removes the active daily target only. The primary assignment, profile access and sender
          authorization remain unchanged.
        </p>
        {row.targets.length > 0 && (
          <dl className="rounded-lg border border-line px-3 py-2 text-[12px]">
            {row.targets.map((target) => (
              <div key={target.targetId} className="flex justify-between gap-2">
                <dt className="text-graphite">{activityLabel(target.activityType as Parameters<typeof activityLabel>[0])}</dt>
                <dd className="tabular-nums text-ink">{target.targetCount}</dd>
              </div>
            ))}
            <div className="mt-1 flex justify-between gap-2 border-t border-line pt-1 font-medium">
              <dt className="text-ink">Total</dt>
              <dd className="tabular-nums text-ink">{row.target}/day</dd>
            </div>
          </dl>
        )}
        {error && <p role="alert" className="text-[12px] text-status-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-graphite">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? 'Removing…' : 'Remove daily plan'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
