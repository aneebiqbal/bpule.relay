'use client'

import { useState } from 'react'
import type { ContentHistoryEntry } from '@/lib/domain/types'

const FIELDS: Array<{ key: keyof Pick<ContentHistoryEntry, 'likes' | 'reach' | 'comments' | 'reposts' | 'saves' | 'profileVisits' | 'followerDelta'>; label: string }> = [
  { key: 'likes', label: 'Likes' },
  { key: 'reach', label: 'Reach / impressions' },
  { key: 'comments', label: 'Comments' },
  { key: 'reposts', label: 'Reposts / shares' },
  { key: 'saves', label: 'Saves' },
  { key: 'profileVisits', label: 'Profile visits' },
  { key: 'followerDelta', label: 'Follower change' },
]

/** Manual, optional, per-field results logging — whatever the platform doesn't show, leave blank. */
export function MetricsLogForm({
  entry,
  onSaved,
}: {
  entry: ContentHistoryEntry
  onSaved: (updated: ContentHistoryEntry) => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, entry[f.key] === null ? '' : String(entry[f.key])])),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {}
      for (const f of FIELDS) {
        const raw = values[f.key].trim()
        body[f.key] = raw === '' ? null : Number(raw)
      }
      const res = await fetch(`/api/content/history/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Failed to save results.')
      onSaved(data.entry)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save results.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-line/60 bg-paper-tint/30 p-3.5">
      <p className="text-xs text-slate">Whatever your platform doesn&apos;t show you, leave blank.</p>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {FIELDS.map((f) => (
          <div key={f.key} className="grid gap-1">
            <label htmlFor={`metric-${entry.id}-${f.key}`} className="text-[11px] text-slate">{f.label}</label>
            <input
              id={`metric-${entry.id}-${f.key}`}
              type="number"
              min={f.key === 'followerDelta' ? undefined : 0}
              value={values[f.key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="h-8 w-full rounded-lg border border-line bg-paper-raised px-2 text-sm outline-none focus-visible:border-studio/40 focus-visible:ring-2 focus-visible:ring-studio/20"
            />
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-status-no">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg gradient-studio px-3.5 py-1.5 text-xs font-semibold text-paper transition-all hover:brightness-110 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save results'}
        </button>
      </div>
    </div>
  )
}
