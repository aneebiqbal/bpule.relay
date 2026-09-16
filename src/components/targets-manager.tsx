'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, AlertCircle, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import type { DailyTarget, RevenueIdentity, Rep, ActivityType } from '@/lib/domain/types'

const ACTIVITY_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: 'dm', label: 'DM' },
  { value: 'connection_request', label: 'Connection Request' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'application', label: 'Application' },
  { value: 'proposal', label: 'Proposal' },
]

function activityLabel(t: ActivityType): string {
  return ACTIVITY_OPTIONS.find((o) => o.value === t)?.label ?? t
}

export function TargetsManager() {
  const [targets, setTargets] = useState<DailyTarget[]>([])
  const [identities, setIdentities] = useState<RevenueIdentity[]>([])
  const [reps, setReps] = useState<Rep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ repId: '', revenueIdentityId: '', activityType: 'dm' as ActivityType, targetCount: 10 })

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/targets').then((r) => r.json()),
      fetch('/api/admin/revenue-identities').then((r) => r.json()),
      fetch('/api/reps').then((r) => r.json()),
    ]).then(([t, i, r]) => {
      setTargets(t.targets ?? [])
      setIdentities(i.identities ?? [])
      setReps(r.reps ?? [])
    }).catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  async function createTarget() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setShowForm(false)
      setForm({ repId: '', revenueIdentityId: '', activityType: 'dm', targetCount: 10 })
      const reload = await fetch('/api/admin/targets')
      const reloaded = await reload.json()
      setTargets(reloaded.targets ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTarget(id: string) {
    const res = await fetch(`/api/admin/targets/${id}`, { method: 'DELETE' })
    if (!res.ok) { setError('Delete failed'); return }
    setTargets((prev) => prev.filter((t) => t.id !== id))
  }

  if (loading) return <div className="text-sm text-slate">Loading targets…</div>

  const activeTargets = targets.filter((target) => target.active)
  const repsCovered = new Set(activeTargets.map((target) => target.repId).filter(Boolean)).size
  const identityCoverage = new Set(activeTargets.map((target) => target.revenueIdentityId)).size
  const totalDailyActions = activeTargets.reduce((sum, target) => sum + target.targetCount, 0)

  const identityLanes = identities
    .filter((identity) => identity.status === 'active')
    .map((identity) => ({
      identity,
      targets: activeTargets.filter((target) => target.revenueIdentityId === identity.id),
    }))
    .filter((lane) => lane.targets.length > 0)

  return (
    <div className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Admin / Accountability Design</p>
        <h2 className="mt-2 text-[24px] leading-[1.08] tracking-[-0.03em] text-[color:var(--console-text)]">
          Set execution expectations per identity.
        </h2>
        <p className="mt-2 text-[13px] text-[color:var(--console-mute)]">
          Targets define what a rep must complete today. Relay measures progress and flags risk.
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
            {showForm ? 'Hide target form' : 'Define target'}
          </Button>
        </div>
      </section>

      {showForm && (
        <section className="srf-proof space-y-4 px-4 py-4 sm:px-5">
          <div>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">New Target Rule</p>
            <p className="mt-1 text-[13px] text-graphite">Attach a daily count to one identity and one activity type.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Rep</Label>
              <Select value={form.repId} onChange={(e) => setForm({ ...form, repId: e.target.value })}>
                <option value="">All assigned reps…</option>
                {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Identity</Label>
              <Select value={form.revenueIdentityId} onChange={(e) => setForm({ ...form, revenueIdentityId: e.target.value })}>
                <option value="">Select…</option>
                {identities.filter((i) => i.status === 'active').map((i) => <option key={i.id} value={i.id}>{i.identityName} ({i.channel})</option>)}
              </Select>
            </div>
            <div>
              <Label>Activity Type</Label>
              <Select value={form.activityType} onChange={(e) => setForm({ ...form, activityType: e.target.value as ActivityType })}>
                {ACTIVITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
            <div>
              <Label>Daily Target</Label>
              <Input type="number" min={1} value={form.targetCount} onChange={(e) => setForm({ ...form, targetCount: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => void createTarget()} disabled={saving || !form.revenueIdentityId}>
              {saving ? <Save className="size-3.5 mr-1.5 animate-spin" /> : <Save className="size-3.5 mr-1.5" />}
              Save
            </Button>
          </div>
        </section>
      )}

      {identityLanes.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Identity Lanes</p>
            <span className="text-[12px] text-graphite">{activeTargets.length} active assignments</span>
          </div>
          <div className="space-y-3">
            {identityLanes.map((lane) => (
              <article key={lane.identity.id} className="overflow-hidden rounded border border-line bg-bone-raised">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <div>
                    <p className="text-[14px] font-medium text-ink">{lane.identity.identityName}</p>
                    <p className="text-[12px] text-graphite">{lane.identity.channel.toUpperCase()} · {lane.identity.title || 'No title set'}</p>
                  </div>
                  <span className="rounded bg-bone px-2 py-1 text-mono-medium text-[10px] uppercase tracking-[0.1em] text-stone">
                    {lane.targets.length} target{lane.targets.length === 1 ? '' : 's'}
                  </span>
                </div>
                <ul className="divide-y divide-line/60">
                  {lane.targets.map((target) => {
                    const rep = reps.find((row) => row.id === target.repId)
                    return (
                      <li key={target.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-medium text-ink">{activityLabel(target.activityType)}</span>
                            <span className="rounded bg-bone px-1.5 py-0.5 text-mono-medium text-[10px] text-stone">
                              {rep?.name ?? 'All assigned reps'}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[12px] text-graphite">{target.targetCount} required actions per day</p>
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
                          onClick={() => void deleteTarget(target.id)}
                          className="rounded p-1 text-slate transition-colors hover:bg-bone hover:text-status-danger"
                          aria-label={`Delete ${lane.identity.identityName} ${activityLabel(target.activityType)} target`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-line py-10 text-center">
          <Target className="mx-auto mb-2 size-6 text-slate" />
          <p className="text-sm font-medium text-ink">No targets set yet</p>
          <p className="mt-1 text-xs text-slate">Define daily expectations per identity and activity.</p>
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
