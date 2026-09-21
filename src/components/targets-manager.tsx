'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Pause, Play, Target, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { activityLabel, formatDefaultPack } from '@/lib/accountability/default-targets'
import { buildTeamTargetOverview } from '@/lib/accountability/target-overview'
import type { DailyTarget, RevenueIdentity, Rep, ActivityType, IdentityAssignment } from '@/lib/domain/types'

const ACTIVITY_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: 'connection_request', label: 'Connections' },
  { value: 'dm', label: 'DMs' },
  { value: 'followup', label: 'Follow-ups' },
  { value: 'application', label: 'Applications' },
  { value: 'proposal', label: 'Proposals' },
  { value: 'other', label: 'Other' },
]

interface TargetsPayload {
  targets?: DailyTarget[]
  identities?: RevenueIdentity[]
  assignments?: IdentityAssignment[]
  reps?: Rep[]
  error?: string
}

export function TargetsManager() {
  const [targets, setTargets] = useState<DailyTarget[]>([])
  const [identities, setIdentities] = useState<RevenueIdentity[]>([])
  const [reps, setReps] = useState<Rep[]>([])
  const [assignments, setAssignments] = useState<IdentityAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [form, setForm] = useState({
    revenueIdentityId: '',
    repId: '',
    activityType: 'dm' as ActivityType,
    targetCount: 30,
    assignIfNeeded: true,
  })
  const [draftCounts, setDraftCounts] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/targets', { cache: 'no-store' })
    const data = (await res.json().catch(() => ({}))) as TargetsPayload
    if (!res.ok) throw new Error(data.error ?? 'Failed to load targets.')
    setTargets(data.targets ?? [])
    setIdentities(data.identities ?? [])
    setAssignments(data.assignments ?? [])
    setReps(data.reps ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load()
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load targets.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [load])

  const identityById = useMemo(() => new Map(identities.map((identity) => [identity.id, identity])), [identities])
  const repsById = useMemo(() => new Map(reps.map((rep) => [rep.id, rep])), [reps])
  const overview = useMemo(
    () => buildTeamTargetOverview({ reps, identities, assignments, targets }),
    [reps, identities, assignments, targets],
  )

  const selectedIdentity = identityById.get(form.revenueIdentityId)
  const assignedRepsForIdentity = form.revenueIdentityId
    ? assignments.filter((assignment) => assignment.revenueIdentityId === form.revenueIdentityId)
    : []
  const packPreview = selectedIdentity ? formatDefaultPack(selectedIdentity.channel) : null
  const canAssignPack = Boolean(form.repId && form.revenueIdentityId)

  function selectIdentity(revenueIdentityId: string) {
    const nextAssignments = assignments.filter((assignment) => assignment.revenueIdentityId === revenueIdentityId)
    setForm((prev) => ({
      ...prev,
      revenueIdentityId,
      repId: nextAssignments.length === 1 ? nextAssignments[0].repId : '',
    }))
  }

  async function assignDailyPack() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repId: form.repId,
          revenueIdentityId: form.revenueIdentityId,
          assignIfNeeded: form.assignIfNeeded,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to assign daily pack.')
      await load()
      setShowForm(false)
      setForm({ revenueIdentityId: '', repId: '', activityType: 'dm', targetCount: 30, assignIfNeeded: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign daily pack.')
    } finally {
      setSaving(false)
    }
  }

  async function createSingleTarget() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repId: form.repId,
          revenueIdentityId: form.revenueIdentityId,
          activityType: form.activityType,
          targetCount: form.targetCount,
          assignIfNeeded: form.assignIfNeeded,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to save target.')
      await load()
      setShowForm(false)
      setShowAdvanced(false)
      setForm({ revenueIdentityId: '', repId: '', activityType: 'dm', targetCount: 30, assignIfNeeded: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save target.')
    } finally {
      setSaving(false)
    }
  }

  async function backfillMissing() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backfillMissing: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to apply standard packs.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply standard packs.')
    } finally {
      setSaving(false)
    }
  }

  async function patchTarget(id: string, patches: { targetCount?: number; active?: boolean }) {
    setError(null)
    const res = await fetch(`/api/admin/targets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patches),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Update failed')
      return
    }
    const updated = data.target as DailyTarget
    setTargets((prev) => prev.map((target) => (target.id === id ? updated : target)))
  }

  async function deleteTarget(id: string) {
    setError(null)
    const res = await fetch(`/api/admin/targets/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setError('Delete failed')
      return
    }
    setTargets((prev) => prev.filter((target) => target.id !== id))
  }

  if (loading) return <div className="text-sm text-slate">Loading targets…</div>

  const visibleIdentities = identities.filter((identity) => identity.status !== 'archived')
  const orphanTargets = targets.filter((target) => !identityById.has(target.revenueIdentityId))

  return (
    <div className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not complete that</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Admin / Targets</p>
        <h2 className="mt-2 text-[24px] leading-[1.08] tracking-[-0.03em] text-[color:var(--console-text)]">
          Daily targets per person.
        </h2>
        <p className="mt-2 text-[13px] text-[color:var(--console-mute)]">
          Assign an identity to a rep and Relay fills the standard day: 30 connections, 30 DMs, 30 follow-ups on LinkedIn, or 10 applications and 10 proposals on Upwork. You can still change any number.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <AdminMetric label="People with work" value={overview.peopleCovered} />
          <AdminMetric label="Active targets" value={overview.activeTargets} />
          <AdminMetric label="Actions / day" value={overview.totalActionsPerDay} />
          <AdminMetric label="Missing packs" value={overview.missingPacks} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setShowForm(!showForm)} size="sm" variant="orange">
            <Plus className="size-3.5 mr-1.5" />
            {showForm ? 'Hide form' : 'Add daily pack'}
          </Button>
          {overview.missingPacks > 0 && (
            <Button onClick={() => void backfillMissing()} size="sm" variant="outline" disabled={saving}>
              Apply standard packs to {overview.missingPacks} missing
            </Button>
          )}
        </div>
      </section>

      {showForm && (
        <section className="srf-proof space-y-4 px-4 py-4 sm:px-5">
          <div>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Assign daily pack</p>
            <p className="mt-1 text-[13px] text-graphite">
              Pick the identity and the person who will run it. Existing counts stay; only missing activities are filled.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="target-identity">Revenue identity</Label>
              <Select id="target-identity" value={form.revenueIdentityId} onChange={(e) => selectIdentity(e.target.value)}>
                <option value="">Select identity…</option>
                {visibleIdentities.map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.identityName} · {identity.channel}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="target-rep">Rep</Label>
              <Select
                id="target-rep"
                value={form.repId}
                onChange={(e) => setForm({ ...form, repId: e.target.value })}
                disabled={!form.revenueIdentityId}
              >
                <option value="">{form.revenueIdentityId ? 'Select rep…' : 'Pick an identity first'}</option>
                {(form.assignIfNeeded ? reps : assignedRepsForIdentity.map((assignment) => repsById.get(assignment.repId)).filter(Boolean) as Rep[]).map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name}
                    {assignedRepsForIdentity.some((assignment) => assignment.repId === rep.id) ? '' : ' · will assign'}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {packPreview && (
            <p className="rounded border border-orange/20 bg-orange/5 px-3 py-2 text-[13px] text-ink">
              Standard pack: {packPreview}
            </p>
          )}
          <label className="flex items-center gap-2 text-[12px] text-graphite">
            <input
              type="checkbox"
              className="size-3.5"
              checked={form.assignIfNeeded}
              onChange={(e) => setForm({ ...form, assignIfNeeded: e.target.checked })}
            />
            <span>Assign the identity to this rep if needed</span>
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => void assignDailyPack()} disabled={saving || !canAssignPack}>
              {saving ? 'Saving' : 'Assign daily pack'}
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="text-[12px] font-medium text-graphite hover:text-ink"
          >
            {showAdvanced ? 'Hide single activity' : 'Add one activity only'}
          </button>
          {showAdvanced && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="target-activity">Activity</Label>
                <Select id="target-activity" value={form.activityType} onChange={(e) => setForm({ ...form, activityType: e.target.value as ActivityType })}>
                  {ACTIVITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="target-count">Daily count</Label>
                <Input
                  id="target-count"
                  type="number"
                  min={1}
                  value={form.targetCount}
                  onChange={(e) => setForm({ ...form, targetCount: Number.parseInt(e.target.value, 10) || 0 })}
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button onClick={() => void createSingleTarget()} disabled={saving || !canAssignPack || form.targetCount <= 0} variant="outline">
                  Save one activity
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {overview.people.length === 0 ? (
        <section className="rounded-xl border border-dashed border-line py-10 text-center">
          <Target className="mx-auto mb-2 size-6 text-slate" />
          <p className="text-sm font-medium text-ink">No targets assigned yet</p>
          <p className="mt-1 text-xs text-slate">Assign an identity to a person to apply the standard daily pack.</p>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Team visibility</p>
            <span className="text-[12px] text-graphite">{overview.peopleCovered} people · {overview.totalActionsPerDay} actions/day</span>
          </div>
          <div className="space-y-3">
            {overview.people.map((person) => (
              <article key={person.repId} className="overflow-hidden rounded border border-line bg-bone-raised">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Users className="size-3.5 text-stone" />
                    <div>
                      <p className="text-[14px] font-medium text-ink">{person.repName}</p>
                      <p className="text-[12px] text-graphite">
                        {person.lanes.length} identit{person.lanes.length === 1 ? 'y' : 'ies'} · {person.totalActionsPerDay} actions/day
                        {person.packComplete ? '' : ' · pack incomplete'}
                      </p>
                    </div>
                  </div>
                </div>
                <ul className="divide-y divide-line/60">
                  {person.lanes.map((lane) => (
                    <li key={`${person.repId}-${lane.identityId}`} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[13px] font-medium text-ink">
                          {lane.identityName}
                          <span className="ml-2 text-[11px] font-normal uppercase tracking-wide text-stone">{lane.channel}</span>
                        </p>
                        <p className="text-[12px] text-graphite">{lane.actionsPerDay} / day</p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {lane.activities.map((activity) => {
                          const draft = draftCounts[activity.id] ?? activity.targetCount
                          const dirty = draft !== activity.targetCount
                          return (
                            <div key={activity.id} className="flex items-center gap-1.5 rounded border border-line bg-bone px-2 py-1">
                              <span className={cn('text-[11px] font-medium', activity.active ? 'text-ink' : 'text-slate')}>
                                {activityLabel(activity.activityType)}
                              </span>
                              <Input
                                type="number"
                                min={1}
                                className="h-7 w-14"
                                value={draft}
                                onChange={(e) => setDraftCounts((prev) => ({ ...prev, [activity.id]: Number.parseInt(e.target.value, 10) || 0 }))}
                                onBlur={() => {
                                  if (!dirty || draft <= 0) return
                                  void patchTarget(activity.id, { targetCount: draft }).then(() => {
                                    setDraftCounts((prev) => {
                                      const next = { ...prev }
                                      delete next[activity.id]
                                      return next
                                    })
                                  })
                                }}
                                aria-label={`${activityLabel(activity.activityType)} daily count`}
                              />
                              <button
                                type="button"
                                onClick={() => void patchTarget(activity.id, { active: !activity.active })}
                                className="rounded p-0.5 text-slate hover:text-ink"
                                aria-label={activity.active ? 'Pause target' : 'Resume target'}
                              >
                                {activity.active ? <Pause className="size-3" /> : <Play className="size-3" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteTarget(activity.id)}
                                className="rounded p-0.5 text-slate hover:text-status-danger"
                                aria-label={`Delete ${activityLabel(activity.activityType)} target`}
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          )
                        })}
                        {lane.missing.map((missing) => (
                          <span key={missing.activityType} className="rounded border border-dashed border-line px-2 py-1 text-[11px] text-slate">
                            Missing {activityLabel(missing.activityType).toLowerCase()} ({missing.targetCount})
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      {orphanTargets.length > 0 && (
        <article className="overflow-hidden rounded border border-dashed border-line bg-bone-raised">
          <div className="border-b border-line px-4 py-3">
            <p className="text-[14px] font-medium text-ink">Unmatched targets</p>
            <p className="text-[12px] text-graphite">Saved, but the identity record is missing.</p>
          </div>
          <ul className="divide-y divide-line/60">
            {orphanTargets.map((target) => (
              <li key={target.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">{activityLabel(target.activityType)}</p>
                  <p className="text-[12px] text-graphite">{target.targetCount} / day · {repsById.get(target.repId)?.name ?? target.repId}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void deleteTarget(target.id)}
                  className="rounded p-1 text-slate hover:text-status-danger"
                  aria-label="Delete unmatched target"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </article>
      )}
    </div>
  )
}

function AdminMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-orange/20 bg-orange/5 px-3 py-2">
      <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-orange-light/80">{label}</p>
      <p className="mt-1 text-[20px] font-medium text-[color:var(--console-text)]">{value}</p>
    </div>
  )
}
