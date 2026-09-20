'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Save, AlertCircle, Target, Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import type { DailyTarget, RevenueIdentity, Rep, ActivityType, IdentityAssignment } from '@/lib/domain/types'

const ACTIVITY_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: 'dm', label: 'First DMs' },
  { value: 'connection_request', label: 'Connection requests' },
  { value: 'followup', label: 'Follow-ups' },
  { value: 'application', label: 'Applications' },
  { value: 'proposal', label: 'Proposals' },
  { value: 'other', label: 'Other' },
]

function activityLabel(t: ActivityType): string {
  return ACTIVITY_OPTIONS.find((o) => o.value === t)?.label ?? t
}

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
  const [form, setForm] = useState({
    revenueIdentityId: '',
    repId: '',
    activityType: 'dm' as ActivityType,
    targetCount: 10,
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

  const identityById = useMemo(() => new Map(identities.map((i) => [i.id, i])), [identities])
  const repsById = useMemo(() => new Map(reps.map((r) => [r.id, r])), [reps])

  const assignedRepsForIdentity = form.revenueIdentityId
    ? assignments.filter((a) => a.revenueIdentityId === form.revenueIdentityId)
    : []

  const canCreate = Boolean(form.repId && form.revenueIdentityId && form.activityType && form.targetCount > 0)

  function selectIdentity(revenueIdentityId: string) {
    const nextAssignments = assignments.filter((a) => a.revenueIdentityId === revenueIdentityId)
    setForm((prev) => ({
      ...prev,
      revenueIdentityId,
      repId: nextAssignments.length === 1 ? nextAssignments[0].repId : '',
    }))
  }

  async function createTarget() {
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
      const saved = data.target as DailyTarget
      setTargets((prev) => {
        const without = prev.filter((t) => !(t.repId === saved.repId && t.revenueIdentityId === saved.revenueIdentityId && t.activityType === saved.activityType))
        return [saved, ...without]
      })
      if (form.assignIfNeeded && !assignments.some((a) => a.repId === form.repId && a.revenueIdentityId === form.revenueIdentityId)) {
        setAssignments((prev) => [
          {
            id: `ia-local-${saved.id}`,
            organizationId: saved.organizationId,
            revenueIdentityId: saved.revenueIdentityId,
            repId: saved.repId,
            assignedBy: saved.createdBy,
            createdAt: saved.createdAt,
          },
          ...prev,
        ])
      }
      setShowForm(false)
      setForm({ revenueIdentityId: '', repId: '', activityType: 'dm', targetCount: 10, assignIfNeeded: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save target.')
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
    setTargets((prev) => prev.map((t) => (t.id === id ? updated : t)))
  }

  async function deleteTarget(id: string) {
    setError(null)
    const res = await fetch(`/api/admin/targets/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setError('Delete failed')
      return
    }
    setTargets((prev) => prev.filter((t) => t.id !== id))
  }

  if (loading) return <div className="text-sm text-slate">Loading targets…</div>

  const activeTargets = targets.filter((target) => target.active)
  const pausedTargets = targets.filter((target) => !target.active)
  const repsCovered = new Set(activeTargets.map((target) => target.repId).filter(Boolean)).size
  const identityCoverage = new Set(activeTargets.map((target) => target.revenueIdentityId)).size
  const totalDailyActions = activeTargets.reduce((sum, target) => sum + target.targetCount, 0)

  const visibleIdentities = identities.filter((identity) => identity.status !== 'archived')
  const grouped = visibleIdentities.map((identity) => ({
    identity,
    targets: targets.filter((target) => target.revenueIdentityId === identity.id),
  }))
  const orphanTargets = targets.filter((target) => !identityById.has(target.revenueIdentityId))

  return (
    <div className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not complete that</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Admin / Accountability</p>
        <h2 className="mt-2 text-[24px] leading-[1.08] tracking-[-0.03em] text-[color:var(--console-text)]">
          Daily expectations per identity.
        </h2>
        <p className="mt-2 text-[13px] text-[color:var(--console-mute)]">
          Set what each revenue identity must complete today. Relay measures progress against these numbers.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <AdminMetric label="Active targets" value={activeTargets.length} />
          <AdminMetric label="Reps covered" value={repsCovered} />
          <AdminMetric label="Identity lanes" value={identityCoverage} />
          <AdminMetric label="Total actions/day" value={totalDailyActions} />
        </div>
        <div className="mt-4">
          <Button onClick={() => setShowForm(!showForm)} size="sm" variant="orange">
            <Plus className="size-3.5 mr-1.5" />
            {showForm ? 'Hide form' : 'Define target'}
          </Button>
        </div>
      </section>

      {showForm && (
        <section className="srf-proof space-y-4 px-4 py-4 sm:px-5">
          <div>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">New daily target</p>
            <p className="mt-1 text-[13px] text-graphite">One identity, one activity, one daily count.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Revenue identity</Label>
              <Select value={form.revenueIdentityId} onChange={(e) => selectIdentity(e.target.value)}>
                <option value="">Select identity…</option>
                {visibleIdentities.map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.identityName} · {identity.channel}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Rep</Label>
              <Select
                value={form.repId}
                onChange={(e) => setForm({ ...form, repId: e.target.value })}
                disabled={!form.revenueIdentityId}
              >
                <option value="">{form.revenueIdentityId ? 'Select rep…' : 'Pick an identity first'}</option>
                {(form.assignIfNeeded ? reps : assignedRepsForIdentity.map((a) => repsById.get(a.repId)).filter(Boolean) as Rep[]).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {assignedRepsForIdentity.some((a) => a.repId === r.id) ? '' : ' · will assign'}
                  </option>
                ))}
              </Select>
              {form.revenueIdentityId && assignedRepsForIdentity.length === 0 && (
                <p className="mt-1 text-[12px] text-status-warning">No one is assigned yet. Saving will assign this rep.</p>
              )}
            </div>
            <div>
              <Label>Activity</Label>
              <Select value={form.activityType} onChange={(e) => setForm({ ...form, activityType: e.target.value as ActivityType })}>
                {ACTIVITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Daily count</Label>
              <Input
                type="number"
                min={1}
                value={form.targetCount}
                onChange={(e) => setForm({ ...form, targetCount: parseInt(e.target.value, 10) || 0 })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-graphite">
            <input
              type="checkbox"
              checked={form.assignIfNeeded}
              onChange={(e) => setForm({ ...form, assignIfNeeded: e.target.checked })}
            />
            Assign the identity to this rep if needed
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => void createTarget()} disabled={saving || !canCreate}>
              <Save className={cn('size-3.5 mr-1.5', saving && 'animate-spin')} />
              {saving ? 'Saving' : 'Save target'}
            </Button>
          </div>
        </section>
      )}

      {grouped.length === 0 && orphanTargets.length === 0 ? (
        <section className="rounded-xl border border-dashed border-line py-10 text-center">
          <Target className="mx-auto mb-2 size-6 text-slate" />
          <p className="text-sm font-medium text-ink">No identities or targets yet</p>
          <p className="mt-1 text-xs text-slate">Create a revenue identity, then set a daily count per activity.</p>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Identity lanes</p>
            <span className="text-[12px] text-graphite">{activeTargets.length} active · {pausedTargets.length} paused</span>
          </div>
          <div className="space-y-3">
            {grouped.map(({ identity, targets: laneTargets }) => {
              const assignedNames = assignments
                .filter((a) => a.revenueIdentityId === identity.id)
                .map((a) => repsById.get(a.repId)?.name)
                .filter(Boolean)
              return (
                <article key={identity.id} className="overflow-hidden rounded border border-line bg-bone-raised">
                  <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <div>
                      <p className="text-[14px] font-medium text-ink">{identity.identityName}</p>
                      <p className="text-[12px] text-graphite">
                        {identity.channel.toUpperCase()}
                        {identity.title ? ` · ${identity.title}` : ''}
                        {assignedNames.length > 0 ? ` · ${assignedNames.join(', ')}` : ' · unassigned'}
                      </p>
                    </div>
                    <span className="rounded bg-bone px-2 py-1 text-mono-medium text-[10px] uppercase tracking-[0.1em] text-stone">
                      {laneTargets.filter((t) => t.active).length} active
                    </span>
                  </div>
                  {laneTargets.length === 0 ? (
                    <p className="px-4 py-4 text-[13px] text-graphite">No daily targets on this identity yet.</p>
                  ) : (
                    <ul className="divide-y divide-line/60">
                      {laneTargets.map((target) => {
                        const draft = draftCounts[target.id] ?? target.targetCount
                        const dirty = draft !== target.targetCount
                        return (
                          <li key={target.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[13px] font-medium text-ink">{activityLabel(target.activityType)}</span>
                                <span className="rounded bg-bone px-1.5 py-0.5 text-mono-medium text-[10px] text-stone">
                                  {repsById.get(target.repId)?.name ?? 'Unknown rep'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={1}
                                className="w-20"
                                value={draft}
                                onChange={(e) => setDraftCounts((prev) => ({ ...prev, [target.id]: parseInt(e.target.value, 10) || 0 }))}
                                aria-label={`${activityLabel(target.activityType)} daily count`}
                              />
                              <span className="text-[11px] text-stone">/ day</span>
                              {dirty && (
                                <Button
                                  size="sm"
                                  variant="orange"
                                  onClick={() => void patchTarget(target.id, { targetCount: draft }).then(() => {
                                    setDraftCounts((prev) => {
                                      const next = { ...prev }
                                      delete next[target.id]
                                      return next
                                    })
                                  })}
                                >
                                  Save
                                </Button>
                              )}
                            </div>
                            <span
                              className={cn(
                                'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                                target.active ? 'bg-status-success/10 text-status-success' : 'bg-stone/20 text-slate',
                              )}
                            >
                              {target.active ? 'Active' : 'Paused'}
                            </span>
                            <button
                              type="button"
                              onClick={() => void patchTarget(target.id, { active: !target.active })}
                              className="rounded p-1 text-slate transition-colors hover:bg-bone hover:text-ink"
                              aria-label={target.active ? 'Pause target' : 'Resume target'}
                            >
                              {target.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteTarget(target.id)}
                              className="rounded p-1 text-slate transition-colors hover:bg-bone hover:text-status-danger"
                              aria-label={`Delete ${identity.identityName} ${activityLabel(target.activityType)} target`}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </article>
              )
            })}

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
        </section>
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
