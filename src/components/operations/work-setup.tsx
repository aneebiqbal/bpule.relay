'use client'

/**
 * Admin → Work Setup — the one management surface.
 *
 * One compact row per real account/channel: who owns it, who else works it, the
 * daily requirement, the allocated share and the live progress. Every figure is
 * the canonical accountability projection; every save goes through the single
 * `/api/admin/work-setup` write path.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, RotateCw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  V4Avatar,
  V4Chip,
  V4Drawer,
  V4Empty,
  V4Error,
  V4Eyebrow,
  V4Panel,
  V4StatStrip,
} from '@/components/v4/primitives'
import { ChannelBadge } from '@/components/ui/channel-badge'
import { activityLabel } from '@/lib/accountability/default-targets'
import type { WorkSetupPayload, WorkSetupRow } from '@/lib/operations/work-setup'
import { catalogKeyLabels, legacyChannelSlug, type ActivityCatalog } from '@/lib/execution/activity-catalog'

const EMPTY_CATALOG: ActivityCatalog = { channels: [], definitions: [], aliases: [] }

interface Draft {
  primaryRepId: string
  operatorIds: string[]
  backupIds: string[]
  targets: Array<{ activityType: string; targetCount: number }>
  allocations: Array<{ activityType: string; repId: string; targetCount: number }>
  /** Compare-and-set token captured when the drawer opened. */
  expectedRevision: string | null
}

/**
 * Pure: what a revision conflict means for the admin, in words. Used by the
 * drawer's conflict panel and unit-tested so the explanation cannot drift from
 * the committed row.
 */
export function workSetupConflictLines(
  current: WorkSetupRow,
  draft: Pick<Draft, 'primaryRepId' | 'operatorIds'>,
  reps: Array<{ id: string; name: string }>,
): string[] {
  const nameOf = (repId: string) => reps.find((rep) => rep.id === repId)?.name ?? 'Unknown rep'
  const lines: string[] = []
  const committedPrimary = current.primaryRepName ?? 'Unassigned'
  const draftPrimary = draft.primaryRepId ? nameOf(draft.primaryRepId) : 'Unassigned'
  if (committedPrimary !== draftPrimary) lines.push(`Primary rep is now ${committedPrimary} (you had ${draftPrimary}).`)
  const committedOperators = current.operators.map((seat) => seat.repName)
  const draftOperators = draft.operatorIds.map(nameOf)
  const added = draftOperators.filter((name) => !committedOperators.includes(name))
  const removed = committedOperators.filter((name) => !draftOperators.includes(name))
  if (added.length) lines.push(`Operators added: ${added.join(', ')}.`)
  if (removed.length) lines.push(`Operators removed: ${removed.join(', ')}.`)
  return lines
}

/** Build the editable draft from one canonical row, including catalog activities. */
function draftFromRow(row: WorkSetupRow, presets: WorkSetupPayload['presets'], catalog: ActivityCatalog): Draft {
  const preset = presets[row.channel] ?? []
  const known = new Map(row.lanes.map((lane) => [lane.activityType, lane.targetCount]))
  const channelId = row.channelId ?? catalog.channels.find(
    (channel) => channel.organizationId === null && channel.slug === legacyChannelSlug(row.channel),
  )?.id
  const catalogActivities = channelId
    ? catalog.definitions.filter((definition) => definition.channelId === channelId && definition.enabled && definition.effectiveUntil === null).map((definition) => definition.key)
    : []
  const activities = [...new Set([...preset.map((p) => p.activityType), ...catalogActivities, ...known.keys()])]
  return {
    primaryRepId: row.primaryRepId ?? '',
    operatorIds: row.operators.map((o) => o.repId),
    backupIds: row.backups.map((b) => b.repId),
    targets: activities.map((activityType) => ({
      activityType,
      targetCount: known.get(activityType) ?? preset.find((p) => p.activityType === activityType)?.targetCount ?? 0,
    })),
    allocations: row.lanes.flatMap((lane) =>
      lane.allocations.map((allocation) => ({
        activityType: lane.activityType,
        repId: allocation.repId,
        targetCount: allocation.targetCount,
      })),
    ),
    expectedRevision: row.revision ?? null,
  }
}

const ISSUE_LABEL: Record<string, string> = {
  unassigned: 'Unassigned',
  'missing-target': 'No target',
  'over-allocated': 'Over-allocated',
  'allocation-without-seat': 'Allocation without seat',
  archived: 'Archived',
}

export function WorkSetupManager() {
  const router = useRouter()
  const [data, setData] = useState<WorkSetupPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [repFilter, setRepFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ current: WorkSetupRow } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/work-setup', { cache: 'no-store' })
      const body = (await res.json().catch(() => ({}))) as WorkSetupPayload & { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Failed to load work setup.')
      setData(body)
      return body
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load work setup.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(() => {
    if (!data) return []
    const needle = query.trim().toLowerCase()
    return data.rows.filter((row) => {
      if (repFilter) {
        const ids = [row.primaryRepId, ...row.operators.map((o) => o.repId)].filter(Boolean)
        if (!ids.includes(repFilter)) return false
      }
      if (channelFilter && row.channel !== channelFilter) return false
      if (onlyProblems && row.issues.length === 0) return false
      if (needle) {
        const haystack = [row.identityName, row.profileName, row.primaryRepName, ...row.operators.map((o) => o.repName)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [data, query, repFilter, channelFilter, onlyProblems])

  const selected = data?.rows.find((row) => row.identityId === selectedId) ?? null
  const catalogLabels = catalogKeyLabels(data?.catalog ?? EMPTY_CATALOG)
  const labelFor = (key: string): string => catalogLabels[key]?.label ?? activityLabel(key as never)

  const [capacityDraft, setCapacityDraft] = useState<Record<string, string>>({})

  async function saveCapacity(repId: string): Promise<void> {
    const raw = capacityDraft[repId] ?? ''
    const value = raw === '' ? null : Number(raw)
    if (value !== null && (!Number.isFinite(value) || value <= 0 || value > 1440)) return
    const response = await fetch('/api/admin/capacity', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repId, availableMinutes: value }),
    })
    if (response.ok) router.refresh()
  }

  function addTarget(activityType: string) {
    setDraft((current) =>
      current && !current.targets.some((lane) => lane.activityType === activityType)
        ? { ...current, targets: [...current.targets, { activityType, targetCount: 0 }] }
        : current,
    )
  }

  function openRow(row: WorkSetupRow) {
    setDraft(draftFromRow(row, data?.presets ?? { linkedin: [], upwork: [], email: [], other: [] }, data?.catalog ?? EMPTY_CATALOG))
    setSaveError(null)
    setConflict(null)
    setSelectedId(row.identityId)
  }

  function closeDrawer() {
    setSelectedId(null)
    setDraft(null)
    setSaveError(null)
    setConflict(null)
  }

  function toggleSeat(field: 'operatorIds' | 'backupIds', repId: string) {
    setDraft((current) => {
      if (!current) return current
      const next = { ...current }
      if (field === 'operatorIds' && repId === next.primaryRepId) return current
      if (field === 'backupIds' && repId === next.primaryRepId) return current
      const list = next[field]
      next[field] = list.includes(repId) ? list.filter((id) => id !== repId) : [...list, repId]
      if (field === 'operatorIds' && next.operatorIds.includes(repId)) {
        next.backupIds = next.backupIds.filter((id) => id !== repId)
      }
      if (field === 'backupIds' && next.backupIds.includes(repId)) {
        next.operatorIds = next.operatorIds.filter((id) => id !== repId)
      }
      return next
    })
  }

  function setTarget(activityType: string, targetCount: number) {
    setDraft((current) =>
      current
        ? { ...current, targets: current.targets.map((row) => (row.activityType === activityType ? { ...row, targetCount } : row)) }
        : current,
    )
  }

  function setAllocation(activityType: string, repId: string, targetCount: number) {
    setDraft((current) => {
      if (!current) return current
      const others = current.allocations.filter((row) => !(row.activityType === activityType && row.repId === repId))
      if (targetCount <= 0) return { ...current, allocations: others }
      return { ...current, allocations: [...others, { activityType, repId, targetCount }] }
    })
  }

  async function save() {
    if (!draft || !selected) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/admin/work-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityId: selected.identityId,
          primaryRepId: draft.primaryRepId,
          operators: draft.operatorIds.map((repId) => ({ repId })),
          backups: draft.backupIds.map((repId) => ({ repId })),
          targets: draft.targets,
          allocations: draft.allocations,
          expectedRevision: draft.expectedRevision ?? undefined,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        code?: string
        revision?: string
        current?: WorkSetupRow | null
      }
      // A concurrent edit won the race. Keep the drawer on the stale draft and
      // show what was committed instead of overwriting it.
      if (res.status === 409 && body.code === 'CONFLICT') {
        const current = body.current ?? data?.rows.find((row) => row.identityId === selected.identityId) ?? null
        if (current) setConflict({ current })
        else setSaveError(body.error ?? 'This account was changed by someone else. Reload and try again.')
        return
      }
      if (!res.ok) throw new Error(body.error ?? 'Could not save.')
      closeDrawer()
      await load()
      router.refresh()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  /** Discard the stale draft, reload, and reopen the row at its new revision. */
  async function loadLatest() {
    if (!selectedId) return
    setConflict(null)
    setSaveError(null)
    const payload = await load()
    const fresh = payload?.rows.find((row) => row.identityId === selectedId) ?? null
    if (fresh) openRow(fresh)
    else closeDrawer()
  }

  if (loading && !data) {
    return (
      <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading work setup">
        <div className="h-16 w-72 animate-pulse rounded-lg bg-bone" />
        <div className="h-[120px] animate-pulse rounded-xl bg-bone-raised ring-1 ring-line" />
        <div className="h-[320px] animate-pulse rounded-xl bg-bone-raised ring-1 ring-line" />
      </div>
    )
  }

  if (error && !data) {
    return <V4Error message={error} onRetry={() => void load()} />
  }
  if (!data) return null

  const totals = data.totals
  const channels = [...new Set(data.rows.map((row) => row.channel))]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <V4Eyebrow>Admin · Work Setup</V4Eyebrow>
          <h1 className="mt-1.5 text-[26px] font-medium tracking-tight text-ink">Work setup</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-graphite">
            One row per account. Assign the primary rep and operators, set the daily target, and allocate a share —
            every dashboard reads the same numbers.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-stone">
          <CheckCircle2 className="size-3.5 text-status-success" aria-hidden />
          Business date {data.businessDate}
        </div>
      </div>

      <V4StatStrip
        label="Organization targets"
        items={[
          { key: 'requirement', label: 'Planned requirement', value: totals.plannedRequirement, tone: 'info' },
          { key: 'allocated', label: 'Allocated', value: totals.allocatedTarget },
          { key: 'unallocated', label: 'Unallocated', value: totals.unallocatedTarget, tone: totals.unallocatedTarget > 0 ? 'warning' : 'success' },
          { key: 'completed', label: 'Completed today', value: totals.completedActions, tone: 'success' },
          { key: 'remaining', label: 'Remaining', value: totals.remainingOrganization },
          { key: 'effort', label: 'Estimated effort / day', value: `${totals.estimatedEffortMinutes}m` },
        ]}
      />
      <V4StatStrip
        label="Team coverage"
        items={[
          { key: 'people', label: 'Active people', value: totals.activePeople },
          { key: 'accounts', label: 'Active accounts', value: totals.activeAccounts },
          { key: 'overdue', label: 'Overdue tasks', value: totals.overdueTasks, tone: totals.overdueTasks > 0 ? 'danger' : 'success' },
          { key: 'remainingAllocated', label: 'Remaining allocated', value: totals.remainingAllocated },
          { key: 'rows', label: 'Accounts listed', value: rows.length },
        ]}
      />

      {data && data.people.length > 0 && (
        <V4Panel className="mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink">People workload</h2>
            <span className="text-[11px] text-stone">personal allocations · capacity not configured where blank</span>
          </div>
          <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="People workload, horizontally scrollable">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-[0.14em] text-stone">
                  <th scope="col" className="py-2 pr-3 font-medium">Rep</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Accounts</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Allocated</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Completed</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Remaining</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Completion</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Est. min</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Available min</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Capacity</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {data.people.map((person) => (
                  <tr key={person.repId} className="border-b border-line/60 last:border-0">
                    <td className="py-2 pr-3 text-[12px] text-ink">{person.repName}</td>
                    <td className="py-2 pr-3 text-right text-[12px] tabular-nums text-graphite">{person.identities}</td>
                    <td className="py-2 pr-3 text-right text-[12px] tabular-nums text-ink">{person.assignedUnits}</td>
                    <td className="py-2 pr-3 text-right text-[12px] tabular-nums text-graphite">{person.completedUnits}</td>
                    <td className="py-2 pr-3 text-right text-[12px] tabular-nums text-graphite">{person.remainingUnits}</td>
                    <td className="py-2 pr-3 text-right text-[12px] tabular-nums text-graphite">
                      {person.completionPct === null ? 'No assigned activity target.' : `${person.completionPct}%`}
                    </td>
                    <td className="py-2 pr-3 text-right text-[12px] tabular-nums text-graphite">{person.estimatedEffortMinutes}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min={1}
                          max={1440}
                          value={capacityDraft[person.repId] ?? (person.availableMinutes ?? '')}
                          onChange={(event) => setCapacityDraft({ ...capacityDraft, [person.repId]: event.target.value })}
                          onBlur={() => void saveCapacity(person.repId)}
                          className="h-6 w-16 rounded border border-line bg-bone px-1 text-right text-[11px] tabular-nums text-ink focus:border-orange/50 focus:outline-none"
                          aria-label={`Available minutes for ${person.repName}`}
                        />
                        <button
                          type="button"
                          onClick={() => void saveCapacity(person.repId)}
                          className="rounded bg-bone-raised px-1.5 py-0.5 text-[10px] text-stone ring-1 ring-line hover:text-ink"
                        >
                          Save
                        </button>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right text-[12px] tabular-nums">
                      {person.capacityStatus === 'not_configured'
                        ? <span className="text-stone">Capacity not configured</span>
                        : <span className={person.capacityStatus === 'overloaded' ? 'text-status-danger' : person.capacityStatus === 'near_capacity' ? 'text-status-warning' : 'text-status-success'}>
                            {person.utilizationPct}% · {person.capacityStatus === 'overloaded' ? 'Overloaded' : person.capacityStatus === 'near_capacity' ? 'Near capacity' : 'Available'}
                          </span>}
                    </td>
                    <td className={`py-2 pr-3 text-right text-[12px] tabular-nums ${person.overdueTasks > 0 ? 'text-status-danger' : 'text-graphite'}`}>{person.overdueTasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </V4Panel>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search account or person"
            aria-label="Search account or person"
            className="h-9 w-56 rounded-lg border border-line bg-bone-raised pl-8 pr-2 text-[12px] text-ink placeholder:text-stone focus:border-orange/50 focus:outline-none"
          />
        </div>
        <select
          value={repFilter}
          onChange={(event) => setRepFilter(event.target.value)}
          aria-label="Filter by rep"
          className="h-9 rounded-lg border border-line bg-bone-raised px-2 text-[12px] text-ink"
        >
          <option value="">Everyone</option>
          {data.reps.map((rep) => (
            <option key={rep.id} value={rep.id}>{rep.name}</option>
          ))}
        </select>
        <select
          value={channelFilter}
          onChange={(event) => setChannelFilter(event.target.value)}
          aria-label="Filter by channel"
          className="h-9 rounded-lg border border-line bg-bone-raised px-2 text-[12px] text-ink"
        >
          <option value="">All channels</option>
          {channels.map((channel) => (
            <option key={channel} value={channel}>{channel}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 rounded-lg border border-line bg-bone-raised px-2.5 py-1.5 text-[12px] text-graphite">
          <input
            type="checkbox"
            checked={onlyProblems}
            onChange={(event) => setOnlyProblems(event.target.checked)}
            className="size-3.5"
          />
          Needs attention
        </label>
      </div>

      <V4Panel padded={false}>
        {rows.length === 0 ? (
          <div className="p-6">
            <V4Empty
              title="No accounts match"
              body="Adjust the filters, or assign a rep to an unassigned account to bring it into the plan."
            />
          </div>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Accounts, horizontally scrollable">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-[0.14em] text-stone">
                  <th scope="col" className="px-4 py-2.5 font-medium">Account</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Channel</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Primary rep</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Operators</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Daily target</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Est. min</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Allocated</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Progress</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Issues</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.identityId}
                    onClick={() => openRow(row)}
                    className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-bone"
                  >
                    <td className="px-4 py-3">
                      <p className="truncate text-[13px] font-medium text-ink">{row.identityName}</p>
                      {row.profileName && row.profileName !== row.identityName && (
                        <p className="truncate text-[11px] text-stone">{row.profileName}</p>
                      )}
                    </td>
                    <td className="px-3 py-3"><ChannelBadge channel={row.channel} /></td>
                    <td className="px-3 py-3">
                      {row.primaryRepName ? (
                        <span className="flex items-center gap-2 text-[12px] text-ink">
                          <V4Avatar name={row.primaryRepName} size="sm" />
                          <span className="truncate">{row.primaryRepName}</span>
                        </span>
                      ) : (
                        <span className="text-[12px] text-status-warning">Unassigned</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {row.operators.length === 0 ? (
                        <span className="text-[12px] text-stone">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {row.operators.map((operator) => (
                            <V4Chip key={operator.repId} tone="neutral">{operator.repName}</V4Chip>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-[13px] tabular-nums text-ink">{row.requirement}</td>
                    <td className="px-3 py-3 text-right text-[12px] tabular-nums text-stone">{row.estimatedEffortMinutes}</td>
                    <td className="px-3 py-3 text-right text-[13px] tabular-nums text-graphite">
                      {row.allocated}
                      {row.unallocated > 0 && <span className="ml-1 text-[10px] text-status-warning">+{row.unallocated}</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-[12px] tabular-nums text-graphite">
                      {row.completed}<span className="text-stone">/{row.remaining}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('text-[12px]', row.status === 'active' ? 'text-status-success' : 'text-stone')}>
                        {row.status === 'active' ? 'Active' : row.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {row.issues.length === 0 ? (
                        <span className="text-[12px] text-stone">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {row.issues.map((issue) => (
                            <V4Chip key={issue} tone="warning">{ISSUE_LABEL[issue] ?? issue}</V4Chip>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </V4Panel>

      <V4Drawer
        open={selected !== null && draft !== null}
        onClose={closeDrawer}
        title={
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-ink">{selected?.identityName}</p>
            <p className="mt-0.5 flex items-center gap-2 text-[11px] text-stone">
              {selected && <ChannelBadge channel={selected.channel} />}
              <span>{selected?.profileName}</span>
            </p>
          </div>
        }
      >
        {selected && draft && (
          <div className="space-y-6 px-5 py-5">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Primary rep</p>
              <select
                value={draft.primaryRepId}
                onChange={(event) => setDraft({ ...draft, primaryRepId: event.target.value })}
                className="mt-2 h-9 w-full rounded-lg border border-line bg-bone-raised px-2 text-[13px] text-ink"
              >
                <option value="">Select primary rep…</option>
                {data.reps.map((rep) => (
                  <option key={rep.id} value={rep.id}>{rep.name}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Additional operators</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.reps
                  .filter((rep) => rep.id !== draft.primaryRepId)
                  .map((rep) => {
                    const active = draft.operatorIds.includes(rep.id)
                    return (
                      <button
                        key={rep.id}
                        type="button"
                        onClick={() => toggleSeat('operatorIds', rep.id)}
                        aria-pressed={active}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[12px] ring-1 transition-colors',
                          active
                            ? 'bg-cobalt/10 text-cobalt-ink ring-cobalt/30'
                            : 'bg-bone-raised text-graphite ring-line hover:text-ink',
                        )}
                      >
                        {rep.name}
                      </button>
                    )
                  })}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Backups</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.reps
                  .filter((rep) => rep.id !== draft.primaryRepId)
                  .map((rep) => {
                    const active = draft.backupIds.includes(rep.id)
                    return (
                      <button
                        key={rep.id}
                        type="button"
                        onClick={() => toggleSeat('backupIds', rep.id)}
                        aria-pressed={active}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[12px] ring-1 transition-colors',
                          active
                            ? 'bg-status-warning/10 text-status-warning ring-status-warning/30'
                            : 'bg-bone-raised text-graphite ring-line hover:text-ink',
                        )}
                      >
                        {rep.name}
                      </button>
                    )
                  })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Daily target plan</p>
                <span className="text-[11px] text-stone">per day</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {draft.targets.map((lane) => (
                  <label key={lane.activityType} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-bone-raised px-3 py-2">
                    <span className="text-[12px] text-ink">{labelFor(lane.activityType)}</span>
                    <input
                      type="number"
                      min={0}
                      value={lane.targetCount}
                      onChange={(event) => setTarget(lane.activityType, Number.parseInt(event.target.value, 10) || 0)}
                      className="h-7 w-16 rounded border border-line bg-bone px-1.5 text-right text-[12px] tabular-nums text-ink focus:border-orange/50 focus:outline-none"
                    />
                  </label>
                ))}
              </div>
              {(() => {
                const channelId = selected?.channelId ?? data?.catalog.channels.find(
                  (channel) => channel.organizationId === null && channel.slug === legacyChannelSlug(selected?.channel),
                )?.id
                const available = (data?.catalog.definitions ?? []).filter(
                  (definition) =>
                    channelId &&
                    definition.channelId === channelId &&
                    definition.enabled &&
                    definition.effectiveUntil === null &&
                    !draft.targets.some((lane) => lane.activityType === definition.key),
                )
                if (!available.length) return null
                return (
                  <label className="mt-2 flex items-center gap-2 text-[11px] text-stone">
                    Add activity
                    <select
                      value=""
                      onChange={(event) => {
                        if (event.target.value) addTarget(event.target.value)
                      }}
                      className="h-7 flex-1 rounded border border-line bg-bone px-1.5 text-[12px] text-ink focus:border-orange/50 focus:outline-none"
                    >
                      <option value="">Choose…</option>
                      {available.map((definition) => (
                        <option key={definition.id} value={definition.key}>{definition.label}</option>
                      ))}
                    </select>
                  </label>
                )
              })()}
              <p className="mt-2 text-[11px] text-stone">
                Presets fill the fields; nothing is written until you save.
              </p>
            </div>

            {draft.operatorIds.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Allocation</p>
                <p className="mt-1 text-[11px] text-graphite">
                  Optional. Blank means the operators share the lane. A lane&apos;s shares may not exceed its target.
                </p>
                <div className="mt-2 space-y-2">
                  {draft.targets
                    .filter((lane) => lane.targetCount > 0)
                    .map((lane) => {
                      const shares = draft.allocations.filter((row) => row.activityType === lane.activityType)
                      const total = shares.reduce((sum, row) => sum + row.targetCount, 0)
                      return (
                        <div key={lane.activityType} className="rounded-lg border border-line bg-bone-raised px-3 py-2">
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="text-ink">{labelFor(lane.activityType)}</span>
                            <span className={cn('tabular-nums', total > lane.targetCount ? 'text-status-danger' : 'text-stone')}>
                              {total}/{lane.targetCount}
                            </span>
                          </div>
                          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                            {[draft.primaryRepId, ...draft.operatorIds].map((repId) => {
                              const rep = data.reps.find((row) => row.id === repId)
                              if (!rep) return null
                              const value = draft.allocations.find(
                                (row) => row.activityType === lane.activityType && row.repId === repId,
                              )?.targetCount
                              return (
                                <label key={repId} className="flex items-center gap-2 text-[11px] text-graphite">
                                  <span className="min-w-0 flex-1 truncate">{rep.name}</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={value ?? ''}
                                    placeholder="—"
                                    onChange={(event) =>
                                      setAllocation(lane.activityType, repId, Number.parseInt(event.target.value, 10) || 0)
                                    }
                                    className="h-7 w-16 rounded border border-line bg-bone px-1.5 text-right text-[12px] tabular-nums text-ink focus:border-orange/50 focus:outline-none"
                                  />
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {conflict && (
              <div role="alert" className="rounded-lg border border-status-warning/40 bg-status-warning/5 px-3 py-2.5">
                <p className="flex items-start gap-2 text-[12px] font-medium text-status-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  This account was changed by another admin while you were editing. Your changes were not applied.
                </p>
                <ul className="mt-1.5 space-y-0.5 text-[12px] text-graphite">
                  {workSetupConflictLines(conflict.current, draft, data.reps).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void loadLatest()}
                    disabled={saving}
                    className="rounded-lg bg-ink px-2.5 py-1 text-[12px] font-medium text-bone transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    Load latest and re-edit
                  </button>
                  <button
                    type="button"
                    onClick={closeDrawer}
                    disabled={saving}
                    className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-graphite disabled:opacity-50"
                  >
                    Discard my changes
                  </button>
                </div>
              </div>
            )}

            {saveError && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-[12px] text-status-danger">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {saveError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-graphite"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !draft.primaryRepId || conflict !== null}
                title={conflict ? 'Load the latest version before saving again' : undefined}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[12px] font-medium text-bone transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? <RotateCw className="size-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="size-3.5" aria-hidden />}
                {saving ? 'Saving…' : 'Save assignment'}
              </button>
            </div>
          </div>
        )}
      </V4Drawer>
    </div>
  )
}
