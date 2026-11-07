'use client'

import { useState } from 'react'
import Link from 'next/link'
import { V4Chip, V4Panel } from '@/components/v4/primitives'
import { CoverageConfigPanel } from '@/components/coverage/coverage-config-panel'
import type { TeamProfileDetail } from '@/lib/team/profile-detail'

const STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  completed: 'success',
  on_track: 'info',
  at_risk: 'warning',
  missed: 'danger',
}

function statusLabel(status: string | null): string {
  if (!status) return '—'
  return status.replaceAll('_', ' ')
}

export function TeamProfileDetailView({
  detail,
  canManage,
  reps,
}: {
  detail: TeamProfileDetail
  canManage: boolean
  reps: Array<{ id: string; name: string }>
}) {
  const [assignOpen, setAssignOpen] = useState(false)
  const [repId, setRepId] = useState('')
  const [backupIds, setBackupIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const pct = detail.targetCount > 0
    ? Math.min(100, Math.round((detail.completedCount / detail.targetCount) * 100))
    : 0

  async function handleAssign() {
    if (!repId || detail.identityIds.length === 0) return
    setSaving(true)
    setMessage(null)
    try {
      // The primary is the permanent assignment.
      const responses = await Promise.all(
        detail.identityIds.map((identityId) =>
          fetch(`/api/admin/revenue-identities/${identityId}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repId }),
          }),
        ),
      )
      if (responses.some((res) => !res.ok)) {
        setMessage('Some channel identities could not be assigned. Retry from this dialog.')
        setSaving(false)
        return
      }
      // Same transaction: backups are coverage eligibility, never ownership.
      const coverage = await fetch(`/api/team/profiles/${detail.profileId}/coverage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryRepId: repId, backups: backupIds.map((id) => ({ repId: id })) }),
      })
      if (!coverage.ok) {
        setMessage('Profile assigned, but the backup chain could not be saved.')
        setSaving(false)
        return
      }
      setMessage('Profile assigned.')
      setAssignOpen(false)
    } catch {
      setMessage('Could not assign the profile. Try again.')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Team / Profiles</p>
          <h1 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">{detail.profileName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {detail.channels.map((channel) => (
              <span
                key={channel}
                className="rounded-full bg-bone px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-graphite ring-1 ring-line"
              >
                {channel}
              </span>
            ))}
            <span className="text-[12px] text-stone">{detail.businessDate}</span>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAssignOpen(true)}
              className="rounded-lg bg-solid px-3.5 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
            >
              {detail.assignedReps.length > 0 ? 'Reassign' : 'Assign rep'}
            </button>
            <Link
              href="/profile-intelligence?tab=identities"
              className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone"
            >
              Edit identities
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <V4Panel>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Assigned rep</p>
          <p className="mt-2 text-[14px] font-medium text-ink">
            {detail.assignedReps.join(', ') || <span className="text-status-warning">Unassigned</span>}
          </p>
        </V4Panel>
        <V4Panel>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Today</p>
          <p className="mt-2 text-[14px] font-medium text-ink">
            {detail.completedCount} / {detail.targetCount}
            <span className="ml-1.5 text-[12px] text-stone">{pct}%</span>
          </p>
        </V4Panel>
        <V4Panel>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Status</p>
          <div className="mt-2">
            <V4Chip tone={STATUS_TONE[detail.status ?? ''] ?? 'neutral'}>{statusLabel(detail.status)}</V4Chip>
          </div>
        </V4Panel>
      </div>

      <V4Panel>
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Today&apos;s activity</p>
        {detail.targets.length > 0 ? (
          <ul className="mt-3 divide-y divide-line/70">
            {detail.targets.map((target) => (
              <li key={target.activityType} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <span className="text-graphite capitalize">{target.activityType.replace(/_/g, ' ')}</span>
                <span className="tabular-nums text-ink">
                  {target.completedCount} / {target.targetCount}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[12px] text-stone">No daily target set for this profile.</p>
        )}
      </V4Panel>

      <CoverageConfigPanel
        profileId={detail.profileId}
        primaryRepId={detail.coverage.primaryRepId}
        backups={detail.coverage.backups}
        reps={reps}
        assignedRepIds={detail.assignedRepIds}
        canManage={canManage}
      />

      <V4Panel>
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Access readiness</p>
        {detail.readiness.length === 0 ? (
          <p className="mt-3 text-[12px] text-stone">
            No coverage chain yet.{' '}
            <Link href="/team/coverage" className="text-cobalt hover:underline">Configure coverage</Link>
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {detail.readiness.map((row) => (
              <li key={row.repId} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-graphite">{row.name}</span>
                <V4Chip tone={row.ready ? 'success' : 'warning'}>
                  {row.ready ? 'Confirmed' : 'Not confirmed'}
                </V4Chip>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-stone">
          Readiness is an explicit rep confirmation. It is the hard gate for automatic cover.
        </p>
      </V4Panel>

      {message && (
        <div role="alert" className="rounded-xl border border-line bg-bone px-4 py-3 text-[12px] text-graphite">
          {message}
        </div>
      )}

      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm">
          <V4Panel className="my-8 w-full max-w-md" innerClassName="p-5">
            <h2 className="text-[18px] font-medium text-ink">Assign profile</h2>
            <p className="mt-1 text-[12px] text-graphite">
              Choose the primary owner and the backups who may cover {detail.profileName}.
            </p>
            <label htmlFor="detail-assign-rep" className="mt-4 block text-[12px] font-medium text-graphite">Primary rep</label>
            <select
              id="detail-assign-rep"
              value={repId}
              onChange={(event) => setRepId(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-line bg-bone-raised px-3 text-[13px] text-ink"
            >
              <option value="">Select a rep</option>
              {reps.map((rep) => (
                <option key={rep.id} value={rep.id}>{rep.name}</option>
              ))}
            </select>
            <fieldset className="mt-4">
              <legend className="text-[12px] font-medium text-graphite">Backups</legend>
              <p className="mt-1 text-[11px] text-stone">
                Backups may cover this profile when the primary is away. They never own it.
              </p>
              <div className="mt-2 space-y-1.5">
                {reps.filter((rep) => rep.id !== repId).map((rep) => (
                  <label key={rep.id} className="flex items-center gap-2 text-[12px] text-ink">
                    <input
                      type="checkbox"
                      checked={backupIds.includes(rep.id)}
                      onChange={(event) =>
                        setBackupIds((prev) =>
                          event.target.checked ? [...prev, rep.id] : prev.filter((id) => id !== rep.id),
                        )
                      }
                      className="size-4 accent-orange"
                    />
                    {rep.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignOpen(false)}
                className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-graphite hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleAssign()}
                disabled={!repId || saving}
                className="rounded-lg bg-solid px-4 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Assigning…' : 'Assign'}
              </button>
            </div>
          </V4Panel>
        </div>
      )}
    </div>
  )
}
