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

function tomorrowIsoLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(17, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AssignTaskDialog({
  open,
  onClose,
  reps,
  defaultAssigneeId,
  defaultLeadId,
  defaultKind = 'REVIEW',
  defaultTitle,
}: {
  open: boolean
  onClose: () => void
  reps: Array<{ id: string; name: string }>
  defaultAssigneeId?: string
  defaultLeadId?: string
  defaultKind?: AssignedTaskKind
  defaultTitle?: string
}) {
  const router = useRouter()
  const [assigneeRepId, setAssigneeRepId] = useState(defaultAssigneeId ?? reps[0]?.id ?? '')
  const [kind, setKind] = useState<AssignedTaskKind>(defaultKind)
  const [title, setTitle] = useState(defaultTitle ?? '')
  const [note, setNote] = useState('')
  const [priority, setPriority] = useState<UnifiedTaskPriority>('NORMAL')
  const [dueLocal, setDueLocal] = useState(tomorrowIsoLocal())
  const [leadId, setLeadId] = useState(defaultLeadId ?? '')
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
    setDueLocal(tomorrowIsoLocal())
    setLeadId(defaultLeadId ?? '')
    setError(null)
  }, [open, defaultAssigneeId, defaultKind, defaultLeadId, defaultTitle, reps])

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

        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-graphite">Lead ID (optional)</span>
          <input
            className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            placeholder="UUID if related to a lead"
          />
        </label>

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
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-[13px] text-ink"
              value={dueLocal}
              onChange={(e) => setDueLocal(e.target.value)}
            />
          </label>
        </div>

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
