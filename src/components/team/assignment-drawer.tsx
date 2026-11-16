'use client'

/**
 * Assignment workspace — one drawer for one profile or many.
 *
 * The admin picks the seats (PRIMARY / OPERATOR / BACKUP), reviews the
 * effective chain, then applies through the canonical bulk endpoint. A dry run
 * is always offered first; the response reports per-profile failures instead of
 * failing the whole batch silently.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { V4Drawer, V4Chip } from '@/components/v4/primitives'
import { cn } from 'cn'

export interface AssignmentProfileOption {
  id: string
  name: string
}

interface ChainEntry {
  repId: string
  repName: string
  role: 'PRIMARY' | 'OPERATOR' | 'BACKUP'
  priority: number
}

interface ProfileDraft {
  primaryRepId: string
  operatorIds: string[]
  backupIds: string[]
}

export function AssignmentDrawer({
  open,
  onClose,
  profiles,
  reps,
  initialProfileIds = [],
}: {
  open: boolean
  onClose: () => void
  profiles: AssignmentProfileOption[]
  reps: Array<{ id: string; name: string }>
  initialProfileIds?: string[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set(initialProfileIds))
  const [drafts, setDrafts] = useState<Record<string, ProfileDraft>>({})
  const [review, setReview] = useState<Array<{ profileId: string; profileName: string; ok: boolean; errors: string[]; chain: ChainEntry[] }> | null>(null)
  const [results, setResults] = useState<Array<{ profileId: string; ok: boolean; error: string | null }> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const selectedIds = [...selected]

  function toggleProfile(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setReview(null)
    setResults(null)
  }

  function draftFor(id: string): ProfileDraft {
    return drafts[id] ?? { primaryRepId: '', operatorIds: [], backupIds: [] }
  }

  function update(id: string, patch: Partial<ProfileDraft>) {
    setDrafts((current) => ({ ...current, [id]: { ...draftFor(id), ...patch } }))
    setReview(null)
    setResults(null)
  }

  function toggleSeat(id: string, field: 'operatorIds' | 'backupIds', repId: string) {
    const draft = draftFor(id)
    const current = draft[field]
    const next = current.includes(repId) ? current.filter((value) => value !== repId) : [...current, repId]
    const patch: Partial<ProfileDraft> = { [field]: next }
    // A rep holds one seat per profile: selecting them as primary clears the
    // other seat, and selecting a seat clears primary.
    if (field === 'operatorIds' && next.includes(repId) && draft.backupIds.includes(repId)) patch.backupIds = draft.backupIds.filter((value) => value !== repId)
    if (field === 'backupIds' && next.includes(repId) && draft.operatorIds.includes(repId)) patch.operatorIds = draft.operatorIds.filter((value) => value !== repId)
    update(id, patch)
  }

  function payload() {
    return selectedIds.map((id) => {
      const draft = draftFor(id)
      return {
        profileId: id,
        primaryRepId: draft.primaryRepId,
        operators: draft.operatorIds.map((repId, index) => ({ repId, priority: index + 1 })),
        backups: draft.backupIds.map((repId, index) => ({ repId, priority: index + 1 })),
      }
    })
  }

  async function reviewChain() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/team/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload(), dryRun: true }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not review the assignment.')
      setReview(body.results ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review the assignment.')
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/team/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not apply the assignment.')
      setResults(body.results ?? [])
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply the assignment.')
    } finally {
      setBusy(false)
    }
  }

  const reviewable = selectedIds.length > 0 && selectedIds.every((id) => draftFor(id).primaryRepId)

  return (
    <V4Drawer
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={
        <div>
          <p className="text-[15px] font-medium text-ink">Assign people</p>
          <p className="mt-0.5 text-[12px] text-stone">
            {selectedIds.length === 0 ? 'Select profiles to begin' : `${selectedIds.length} profile${selectedIds.length === 1 ? '' : 's'} selected`}
          </p>
        </div>
      }
    >
      <div className="space-y-5 px-5 py-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Profiles</p>
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {profiles.map((profile) => (
              <label
                key={profile.id}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[13px] transition-colors',
                  selected.has(profile.id) ? 'border-line bg-bone-raised text-ink' : 'border-line/70 text-graphite hover:bg-bone-raised',
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(profile.id)}
                  onChange={() => toggleProfile(profile.id)}
                  className="size-4 accent-ink"
                />
                <span className="truncate">{profile.name}</span>
              </label>
            ))}
          </div>
        </div>

        {selectedIds.map((id) => {
          const draft = draftFor(id)
          const others = reps.filter((rep) => rep.id !== draft.primaryRepId)
          return (
            <div key={id} className="rounded-xl border border-line bg-bone-raised p-3">
              <p className="truncate text-[13px] font-medium text-ink">{profileById.get(id)?.name ?? 'Profile'}</p>
              <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Primary</span>
                  <select
                    value={draft.primaryRepId}
                    onChange={(event) => update(id, { primaryRepId: event.target.value })}
                    className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
                  >
                    <option value="">Choose…</option>
                    {reps.map((rep) => (
                      <option key={rep.id} value={rep.id}>{rep.name}</option>
                    ))}
                  </select>
                </label>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Operators</span>
                  <div className="mt-1 max-h-28 space-y-1 overflow-y-auto rounded-md border border-line bg-bone p-1.5">
                    {others.map((rep) => (
                      <label key={rep.id} className="flex min-h-8 items-center gap-2 rounded px-1.5 text-[12px] text-graphite hover:bg-bone-raised">
                        <input
                          type="checkbox"
                          checked={draft.operatorIds.includes(rep.id)}
                          onChange={() => toggleSeat(id, 'operatorIds', rep.id)}
                          className="size-3.5 accent-ink"
                        />
                        <span className="truncate">{rep.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Backups</span>
                  <div className="mt-1 max-h-28 space-y-1 overflow-y-auto rounded-md border border-line bg-bone p-1.5">
                    {others.map((rep) => (
                      <label key={rep.id} className="flex min-h-8 items-center gap-2 rounded px-1.5 text-[12px] text-graphite hover:bg-bone-raised">
                        <input
                          type="checkbox"
                          checked={draft.backupIds.includes(rep.id)}
                          onChange={() => toggleSeat(id, 'backupIds', rep.id)}
                          className="size-3.5 accent-ink"
                        />
                        <span className="truncate">{rep.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {review && (
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Effective access</p>
            {review.map((row) => (
              <div key={row.profileId} className="rounded-lg border border-line bg-bone px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] font-medium text-ink">{row.profileName}</p>
                  {row.ok ? <V4Chip tone="success">Ready</V4Chip> : <V4Chip tone="danger">Blocked</V4Chip>}
                </div>
                {row.errors.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[12px] text-status-danger">
                    {row.errors.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                )}
                {row.ok && (
                  <p className="mt-1 text-[12px] text-graphite">
                    {row.chain.map((entry) => `${entry.repName} (${entry.role.toLowerCase()})`).join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {results && (
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Applied</p>
            {results.map((row) => (
              <div key={row.profileId} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-bone px-3 py-2 text-[13px]">
                <span className="truncate text-ink">{profileById.get(row.profileId)?.name ?? row.profileId}</span>
                {row.ok ? <V4Chip tone="success">Saved</V4Chip> : <V4Chip tone="danger">{row.error ?? 'Failed'}</V4Chip>}
              </div>
            ))}
          </div>
        )}

        {error && <p role="alert" className="text-[12px] text-status-danger">{error}</p>}

        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-[11px] text-stone">One shared plan per channel; operators are counted separately.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void reviewChain()}
              disabled={busy || !reviewable}
              className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Review access'}
            </button>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={busy || !reviewable}
              className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </V4Drawer>
  )
}
