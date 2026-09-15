'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, AlertCircle, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from 'cn'
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

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">{targets.length} target{targets.length !== 1 ? 's' : ''}</p>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="size-3.5 mr-1.5" /> Set Target
        </Button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-line bg-bone-raised p-5 space-y-4">
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
        </div>
      )}

      <div className="rounded-xl border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-bone-raised">
              <th className="px-3 py-2 text-left text-label text-stone">Rep</th>
              <th className="px-3 py-2 text-left text-label text-stone">Identity</th>
              <th className="px-3 py-2 text-left text-label text-stone">Activity</th>
              <th className="px-3 py-2 text-right text-label text-stone">Target</th>
              <th className="px-3 py-2 text-right text-label text-stone">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => {
              const identity = identities.find((i) => i.id === t.revenueIdentityId)
              const rep = reps.find((r) => r.id === t.repId)
              return (
                <tr key={t.id} className="border-b border-line/50">
                  <td className="px-3 py-2 text-graphite">{rep?.name ?? '—'}</td>
                  <td className="px-3 py-2 font-medium text-ink">{identity?.identityName ?? '—'}</td>
                  <td className="px-3 py-2 text-graphite">{activityLabel(t.activityType)}</td>
                  <td className="px-3 py-2 text-right text-mono-medium text-ink">{t.targetCount}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium',
                      t.active ? 'bg-status-success/10 text-status-success' : 'bg-stone/20 text-slate'
                    )}>{t.active ? 'active' : 'paused'}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => void deleteTarget(t.id)} className="rounded p-1 text-slate hover:text-red-500 hover:bg-bone">
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
            {targets.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center">
                <Target className="mx-auto size-6 text-slate mb-2" />
                <p className="text-sm text-slate">No targets set. Define daily expectations per identity and activity.</p>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
