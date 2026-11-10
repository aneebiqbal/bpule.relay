'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { AssignedTaskKind, UnifiedTaskPriority } from '@/lib/tasks/types'

const KINDS: Array<{ value: AssignedTaskKind; label: string }> = [
  { value: 'REVIEW', label: 'Review' },
  { value: 'REQUEST_UPDATE', label: 'Request update' },
  { value: 'CALL', label: 'Call' },
  { value: 'RESEARCH', label: 'Research' },
  { value: 'PREPARE_PROPOSAL', label: 'Prepare proposal' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'CUSTOM', label: 'Custom' },
]

const PRIORITIES: UnifiedTaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL']

export interface AssignTaskLeadOption {
  id: string
  company: string | null
}

export interface AssignTaskProfileOption {
  id: string
  name: string
}

function atLocal(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(17, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function todayIsoLocal(): string {
  return atLocal(0)
}

function tomorrowIsoLocal(): string {
  return atLocal(1)
}

export function AssignTaskDialog({
  open,
  onClose,
  reps,
  defaultAssigneeId,
  defaultLeadId,
  defaultProfileId,
  defaultRevenueIdentityId,
  defaultKind = 'REVIEW',
  defaultTitle,
  leads = [],
  profiles = [],
}: {
  open: boolean
  onClose: () => void
  reps: Array<{ id: string; name: string }>
  defaultAssigneeId?: string
  defaultLeadId?: string
  defaultProfileId?: string
  /** Channel identity the task is about (revenue_identities.id), when known. */
  defaultRevenueIdentityId?: string
  defaultKind?: AssignedTaskKind
  defaultTitle?: string
  /** Searchable lead options. When empty the lead field stays a raw id input. */
  leads?: AssignTaskLeadOption[]
  /** Canonical profile options. */
  profiles?: AssignTaskProfileOption[]
}) {
  const router = useRouter()
  const [assigneeRepId, setAssigneeRepId] = useState(defaultAssigneeId ?? reps[0]?.id ?? '')
  const [kind, setKind] = useState<AssignedTaskKind>(defaultKind)
  const [title, setTitle] = useState(defaultTitle ?? '')
  const [note, setNote] = useState('')
  const [priority, setPriority] = useState<UnifiedTaskPriority>('NORMAL')
  const [duePreset, setDuePreset] = useState<'today' | 'tomorrow' | 'custom'>('tomorrow')
  const [dueLocal, setDueLocal] = useState(tomorrowIsoLocal())
  const [leadId, setLeadId] = useState(defaultLeadId ?? '')
  const [profileId, setProfileId] = useState(defaultProfileId ?? '')
  const [revenueIdentityId, setRevenueIdentityId] = useState(defaultRevenueIdentityId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setAssigneeRepId(defaultAssigneeId ?? reps[0]?.id ?? '')
    setKind(defaultKind)
    setTitle(
      defaultTitle
      ?? (defaultKind === 'REQUEST_UPDATE' ? 'Update needed' : ''),
    )
    setNote('')
    setPriority('NORMAL')
    setDuePreset('tomorrow')
    setDueLocal(tomorrowIsoLocal())
    setLeadId(defaultLeadId ?? '')
    setProfileId(defaultProfileId ?? '')
    setRevenueIdentityId(defaultRevenueIdentityId ?? '')
    setError(null)
  }, [open, defaultAssigneeId, defaultKind, defaultLeadId, defaultProfileId, defaultRevenueIdentityId, defaultTitle, reps])

  function pickDuePreset(preset: 'today' | 'tomorrow' | 'custom') {
    setDuePreset(preset)
    if (preset === 'today') setDueLocal(todayIsoLocal())
    if (preset === 'tomorrow') setDueLocal(tomorrowIsoLocal())
  }

  async function submit() {
    if (!assigneeRepId || !title.trim()) {
      setError('Assignee and title are required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const dueAt = dueLocal ? new Date(dueLocal).toISOString() : null
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigneeRepId,
          kind,
          title: title.trim(),
          description: note.trim() || null,
          priority,
          dueAt,
          leadId: leadId.trim() || null,
          profileId: profileId || null,
          revenueIdentityId: revenueIdentityId || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to create task')
      onClose()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={kind === 'REQUEST_UPDATE' ? 'Request update' : 'Assign task'}
      description="Creates a persistent assigned task. Derived sales work stays in the queue."
      className="max-w-lg"
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-graphite">Assignee</span>
          <select
            className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
            value={assigneeRepId}
            onChange={(e) => setAssigneeRepId(e.target.value)}
          >
            {reps.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-graphite">Task type</span>
          <select
            className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
            value={kind}
            onChange={(e) => setKind(e.target.value as AssignedTaskKind)}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-graphite">Title</span>
          <input
            className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What should they do?"
          />
        </label>

        <fieldset className="space-y-3 rounded-lg border border-line px-3 py-2.5">
          <legend className="px-1 text-[12px] font-medium text-graphite">Related to</legend>
          <label className="block space-y-1">
            <span className="text-[12px] text-stone">Lead (optional)</span>
            {leads.length > 0 ? (
              <select
                className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
              >
                <option value="">None</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>{lead.company ?? 'Untitled lead'}</option>
                ))}
              </select>
            ) : (
              <input
                className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                placeholder="Lead ID"
              />
            )}
          </label>
          <label className="block space-y-1">
            <span className="text-[12px] text-stone">Profile (optional)</span>
            {profiles.length > 0 ? (
              <select
                className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
              >
                <option value="">None</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            ) : (
              <input
                className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                placeholder="Profile ID"
              />
            )}
          </label>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-graphite">Priority</span>
            <select
              className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
              value={priority}
              onChange={(e) => setPriority(e.target.value as UnifiedTaskPriority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-graphite">Due</span>
            <select
              className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
              value={duePreset}
              onChange={(e) => pickDuePreset(e.target.value as 'today' | 'tomorrow' | 'custom')}
            >
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="custom">Pick a date</option>
            </select>
          </label>
        </div>

        {duePreset === 'custom' && (
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-graphite">Due date</span>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
              value={dueLocal}
              onChange={(e) => setDueLocal(e.target.value)}
            />
          </label>
        )}

        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-graphite">Note</span>
          <textarea
            className="min-h-[72px] w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Internal note — no raw conversation content"
          />
        </label>

        {error && (
          <p className="text-[12px] text-status-danger" role="alert">{error}</p>
        )}
      </div>

      <DialogActions className="mt-5">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : 'Assign'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
