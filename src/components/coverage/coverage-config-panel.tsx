'use client'

/**
 * Coverage configuration for one profile: the primary owner of record and the
 * ordered backup chain. Eligibility is still proven by `identity_assignments`
 * at evaluation time — this panel only records intent.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  V4Chip,
  V4Panel,
  V4PanelHeader,
} from '@/components/v4/primitives'

interface BackupRow {
  repId: string
  priority: number
}

export function CoverageConfigPanel({
  profileId,
  primaryRepId,
  backups,
  reps,
  assignedRepIds,
  canManage,
}: {
  profileId: string
  primaryRepId: string | null
  backups: BackupRow[]
  reps: Array<{ id: string; name: string }>
  assignedRepIds: string[]
  canManage: boolean
}) {
  const router = useRouter()
  const [primary, setPrimary] = useState(primaryRepId ?? '')
  const [rows, setRows] = useState<BackupRow[]>(backups)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const assigned = new Set(assignedRepIds)

  function updateRow(index: number, repId: string) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, repId } : row)))
  }

  function move(index: number, delta: number) {
    setRows((current) => {
      const next = [...current]
      const target = index + delta
      if (target < 0 || target >= next.length) return current
      const [row] = next.splice(index, 1)
      next.splice(target, 0, row)
      return next.map((entry, i) => ({ ...entry, priority: i + 1 }))
    })
  }

  async function save() {
    if (!primary) {
      setError('Choose a primary rep.')
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/team/profiles/${profileId}/coverage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryRepId: primary,
          backups: rows
            .filter((row) => row.repId && row.repId !== primary)
            .map((row, index) => ({ repId: row.repId, priority: index + 1 })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Coverage could not be saved.')
        return
      }
      setMessage('Coverage saved.')
      router.refresh()
    } catch {
      setError('Network error. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <V4Panel>
      <V4PanelHeader
        eyebrow="Coverage"
        title="Primary and backups"
        hint="Ordered fallback chain for leave and unavailability"
      />

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="coverage-primary" className="text-[12px] font-medium text-graphite">
            Primary rep
          </label>
          <select
            id="coverage-primary"
            value={primary}
            disabled={!canManage}
            onChange={(event) => setPrimary(event.target.value)}
            className="mt-1.5 h-10 w-full rounded-lg border border-line bg-bone-raised px-3 text-[13px] text-ink disabled:opacity-60"
          >
            <option value="">Select a rep</option>
            {reps.map((rep) => (
              <option key={rep.id} value={rep.id}>{rep.name}</option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-[12px] font-medium text-graphite">Backups, in order</p>
          <ul className="mt-1.5 space-y-2">
            {rows.map((row, index) => (
              <li key={`${row.repId}-${index}`} className="flex items-center gap-2">
                <span className="w-5 text-[11px] tabular-nums text-stone">{index + 1}</span>
                <select
                  aria-label={`Backup ${index + 1}`}
                  value={row.repId}
                  disabled={!canManage}
                  onChange={(event) => updateRow(index, event.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bone-raised px-3 text-[13px] text-ink disabled:opacity-60"
                >
                  <option value="">Select a rep</option>
                  {reps.map((rep) => (
                    <option key={rep.id} value={rep.id}>{rep.name}</option>
                  ))}
                </select>
                {!assigned.has(row.repId) && row.repId && (
                  <V4Chip tone="warning">No assignment</V4Chip>
                )}
                {canManage && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Move backup ${index + 1} up`}
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      className="rounded-md border border-line p-1 text-graphite hover:bg-bone disabled:opacity-40"
                    >
                      <ChevronUp className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move backup ${index + 1} down`}
                      onClick={() => move(index, 1)}
                      disabled={index === rows.length - 1}
                      className="rounded-md border border-line p-1 text-graphite hover:bg-bone disabled:opacity-40"
                    >
                      <ChevronDown className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove backup ${index + 1}`}
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index).map((entry, i) => ({ ...entry, priority: i + 1 })))}
                      className="rounded-md border border-line px-2 py-1 text-[11px] text-graphite hover:bg-bone"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {rows.length === 0 && (
            <p className="mt-2 text-[12px] text-stone">No backups configured.</p>
          )}
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setRows((current) => [...current, { repId: '', priority: current.length + 1 }])}
              className="rounded-lg border border-line bg-bone-raised px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone"
            >
              Add backup
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save coverage'}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-[12px] text-graphite">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="rounded-lg border border-status-success/30 bg-status-success/5 px-3 py-2 text-[12px] text-graphite">
            {message}
          </p>
        )}

        <p className="text-[11px] leading-relaxed text-stone">
          Backups only receive work when the canonical assignment, channel capability, availability and
          workload all prove eligibility. A backup with no assignment is shown but never selected automatically.
        </p>
      </div>
    </V4Panel>
  )
}
