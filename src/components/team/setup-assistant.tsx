'use client'

/**
 * Setup Assistant — describe an outcome, preview the change, apply it.
 *
 * Two equivalent authors: a structured form (no AI dependency) and an optional
 * natural-language parse. Both produce the same preview shape and both apply
 * through the canonical writers, so the AI never touches the database directly.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { V4Drawer, V4Chip } from '@/components/v4/primitives'
import { cn } from 'cn'

interface PreviewRep {
  repId: string
  repName: string
}

interface Preview {
  assignments: Array<{
    profileId: string
    profileName: string
    primaryRepId: string | null
    primaryRepName: string | null
    operators: PreviewRep[]
    backups: PreviewRep[]
  }>
  targets: Array<{
    profileId: string
    profileName: string
    identityId: string
    identityName: string
    channel: string
    activityType: string
    targetCount: number
    allocations: Array<{ repId: string; repName: string; targetCount: number }>
  }>
  schedules: Array<{ profileId: string; profileName: string; repId: string; repName: string; daysOfWeek: number[] }>
}

const EMPTY_PREVIEW: Preview = { assignments: [], targets: [], schedules: [] }

const METRICS = [
  { value: 'connection_request', label: 'Connections' },
  { value: 'dm', label: 'Messages' },
  { value: 'followup', label: 'Follow-ups' },
  { value: 'application', label: 'Applications' },
  { value: 'proposal', label: 'Proposals' },
  { value: 'prospect_extracted', label: 'Prospects' },
  { value: 'other', label: 'Tasks' },
]

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function SetupAssistant({
  open,
  onClose,
  profiles,
  reps,
  identities,
}: {
  open: boolean
  onClose: () => void
  profiles: Array<{ id: string; name: string }>
  reps: Array<{ id: string; name: string }>
  identities: Array<{ id: string; profileId: string; channel: string; name: string }>
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'describe' | 'form'>('describe')
  const [prompt, setPrompt] = useState('')
  const [preview, setPreview] = useState<Preview>(EMPTY_PREVIEW)
  const [warnings, setWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<string[]>([])

  // Deterministic form state.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [primary, setPrimary] = useState<Record<string, string>>({})
  const [operators, setOperators] = useState<Record<string, string[]>>({})
  const [metric, setMetric] = useState('connection_request')
  const [target, setTarget] = useState('20')
  const [channel, setChannel] = useState('')
  const [split, setSplit] = useState<Record<string, string>>({})
  const [days, setDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]))

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const repById = useMemo(() => new Map(reps.map((rep) => [rep.id, rep])), [reps])

  function toggleSet(set: Set<string>, id: string): Set<string> {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  async function parsePrompt() {
    setBusy(true)
    setError(null)
    setWarnings([])
    try {
      const res = await fetch('/api/team/setup/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not parse that request.')
      setPreview(body.preview ?? EMPTY_PREVIEW)
      setWarnings(body.warnings ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse that request.')
    } finally {
      setBusy(false)
    }
  }

  function buildFormPreview(): Preview {
    const assignments = [...selected].flatMap((id) => {
      const repId = primary[id]
      if (!repId) return []
      const ops = operators[id] ?? []
      return [{
        profileId: id,
        profileName: profileById.get(id)?.name ?? 'Profile',
        primaryRepId: repId,
        primaryRepName: repById.get(repId)?.name ?? 'Unknown',
        operators: ops.map((op) => ({ repId: op, repName: repById.get(op)?.name ?? 'Unknown' })),
        backups: [],
      }]
    })
    const targets = [...selected].flatMap((id) => {
      const count = Math.round(Number(target))
      if (!Number.isFinite(count) || count <= 0) return []
      const identity = identities.find((entry) => entry.profileId === id && (!channel || entry.channel === channel))
      if (!identity) return []
      const ops = operators[id] ?? []
      const shares = Object.entries(split)
        .filter(([repId]) => ops.includes(repId))
        .map(([repId, value]) => ({ repId, targetCount: Math.round(Number(value)) || 0 }))
        .filter((row) => row.targetCount > 0)
      return [{
        profileId: id,
        profileName: profileById.get(id)?.name ?? 'Profile',
        identityId: identity.id,
        identityName: identity.name,
        channel: identity.channel,
        activityType: metric,
        targetCount: count,
        allocations: shares.map((row) => ({ ...row, repName: repById.get(row.repId)?.name ?? 'Unknown' })),
      }]
    })
    const schedules = [...selected].flatMap((id) => {
      const repId = primary[id]
      if (!repId || days.size === 0) return []
      return [{
        profileId: id,
        profileName: profileById.get(id)?.name ?? 'Profile',
        repId,
        repName: repById.get(repId)?.name ?? 'Unknown',
        daysOfWeek: [...days].sort(),
      }]
    })
    return { assignments, targets, schedules }
  }

  function applyFormPreview() {
    setPreview(buildFormPreview())
    setWarnings([])
  }

  async function apply() {
    setBusy(true)
    setError(null)
    setResults([])
    const log: string[] = []
    try {
      if (preview.assignments.length > 0) {
        const res = await fetch('/api/team/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: preview.assignments.map((row) => ({
              profileId: row.profileId,
              primaryRepId: row.primaryRepId ?? undefined,
              operators: row.operators.map((rep, index) => ({ repId: rep.repId, priority: index + 1 })),
              backups: row.backups.map((rep, index) => ({ repId: rep.repId, priority: index + 1 })),
            })),
          }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'Assignment failed.')
        for (const row of body.results ?? []) {
          const name = profileById.get(row.profileId)?.name ?? row.profileId
          log.push(`${name}: ${row.ok ? 'assigned' : row.error ?? 'failed'}`)
        }
      }

      for (const row of preview.targets) {
        if (!row.identityId) {
          log.push(`${row.profileName}: needs a channel — set the target from the profile.`)
          continue
        }
        const res = await fetch('/api/admin/targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repId: row.allocations[0]?.repId ?? preview.assignments.find((assignment) => assignment.profileId === row.profileId)?.primaryRepId,
            revenueIdentityId: row.identityId,
            activityType: row.activityType,
            targetCount: row.targetCount,
          }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          log.push(`${row.profileName}: target failed (${body.error ?? 'error'})`)
          continue
        }
        const plan = body.target ?? (Array.isArray(body.targets) ? body.targets[0] : null)
        if (plan?.id && row.allocations.length > 0) {
          const allocRes = await fetch(`/api/admin/targets/${plan.id}/allocations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'allocated', allocations: row.allocations }),
          })
          const allocBody = await allocRes.json().catch(() => ({}))
          log.push(`${row.profileName}: ${allocRes.ok ? 'targets allocated' : `allocation failed (${allocBody.error ?? 'error'})`}`)
        } else {
          log.push(`${row.profileName}: target set`)
        }
      }

      for (const row of preview.schedules) {
        const res = await fetch(`/api/team/profiles/${row.profileId}/schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shifts: [{ repId: row.repId, startTime: '09:00', endTime: '18:00', daysOfWeek: row.daysOfWeek }] }),
        })
        const body = await res.json().catch(() => ({}))
        log.push(`${row.profileName}: ${res.ok ? `schedule set for ${row.repName}` : `schedule failed (${body.error ?? 'error'})`}`)
      }

      setResults(log)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply the setup.')
    } finally {
      setBusy(false)
    }
  }

  const empty = preview.assignments.length + preview.targets.length + preview.schedules.length === 0

  return (
    <V4Drawer
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={
        <div>
          <p className="text-[15px] font-medium text-ink">Setup assistant</p>
          <p className="mt-0.5 text-[12px] text-stone">Describe the outcome, review the change, then apply it.</p>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-4">
      <div className="flex rounded-lg border border-line bg-bone-raised p-0.5">
        {(['describe', 'form'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => setMode(option)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
              mode === option ? 'bg-bone text-ink shadow-sm' : 'text-graphite hover:text-ink',
            )}
          >
            {option === 'describe' ? 'Describe' : 'Form'}
          </button>
        ))}
      </div>

      {mode === 'describe' ? (
        <div className="space-y-2">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">What should change?</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              placeholder="Assign Ahmad and Dawood to Aneeb's profiles, split LinkedIn connection targets 60/40, weekdays for the next month."
              className="mt-1 w-full rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] text-ink placeholder:text-stone"
            />
          </label>
          <button
            type="button"
            onClick={() => void parsePrompt()}
            disabled={busy || prompt.trim().length < 8}
            className="rounded-lg bg-solid px-3 py-2 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Parse request'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Profiles</p>
            <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {profiles.map((profile) => (
                <label key={profile.id} className="flex min-h-10 items-center gap-2 rounded-lg border border-line/70 px-3 text-[13px] text-graphite">
                  <input
                    type="checkbox"
                    checked={selected.has(profile.id)}
                    onChange={() => setSelected((current) => toggleSet(current, profile.id))}
                    className="size-4 accent-ink"
                  />
                  <span className="truncate">{profile.name}</span>
                </label>
              ))}
            </div>
          </div>
          {[...selected].map((id) => (
            <div key={id} className="rounded-xl border border-line bg-bone-raised p-3">
              <p className="truncate text-[13px] font-medium text-ink">{profileById.get(id)?.name}</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Primary</span>
                  <select
                    value={primary[id] ?? ''}
                    onChange={(event) => setPrimary((current) => ({ ...current, [id]: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
                  >
                    <option value="">Choose…</option>
                    {reps.map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
                  </select>
                </label>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Operators</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {reps.filter((rep) => rep.id !== primary[id]).map((rep) => (
                      <button
                        key={rep.id}
                        type="button"
                        aria-pressed={(operators[id] ?? []).includes(rep.id)}
                        onClick={() =>
                          setOperators((current) => {
                            const currentList = current[id] ?? []
                            const next = currentList.includes(rep.id)
                              ? currentList.filter((value) => value !== rep.id)
                              : [...currentList, rep.id]
                            return { ...current, [id]: next }
                          })
                        }
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                          (operators[id] ?? []).includes(rep.id)
                            ? 'border-line bg-bone text-ink'
                            : 'border-line/70 text-graphite hover:text-ink',
                        )}
                      >
                        {rep.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Channel</span>
              <select
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
              >
                <option value="">All channels</option>
                {[...new Set(identities.filter((entry) => selected.has(entry.profileId)).map((entry) => entry.channel))].map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Metric</span>
              <select
                value={metric}
                onChange={(event) => setMetric(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
              >
                {METRICS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Target / day</span>
              <input
                type="number"
                min={1}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] tabular-nums text-ink"
              />
            </label>
            <div className="col-span-2">
              <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Operator split (optional)</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {reps.map((rep) => (
                  <label key={rep.id} className="flex items-center gap-1 text-[11px] text-graphite">
                    {rep.name}
                    <input
                      type="number"
                      min={0}
                      value={split[rep.id] ?? ''}
                      onChange={(event) => setSplit((current) => ({ ...current, [rep.id]: event.target.value }))}
                      className="h-8 w-16 rounded-md border border-line bg-bone px-1.5 text-[12px] tabular-nums text-ink"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Schedule days</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DAY_LABELS.map((label, day) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={days.has(day)}
                  onClick={() => {
                    const next = new Set(days)
                    if (next.has(day)) next.delete(day)
                    else next.add(day)
                    setDays(next)
                  }}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                    days.has(day) ? 'border-line bg-bone text-ink' : 'border-line/70 text-graphite hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={applyFormPreview}
            disabled={selected.size === 0}
            className="rounded-lg border border-line px-3 py-2 text-[12px] font-medium text-graphite transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            Build preview
          </button>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning/5 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-status-warning">Could not resolve</p>
          <ul className="mt-1 space-y-0.5 text-[12px] text-graphite">
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      {empty ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[13px] text-graphite">
          Nothing to preview yet.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Change preview</p>
          {preview.assignments.map((row) => (
            <div key={`a:${row.profileId}`} className="rounded-lg border border-line bg-bone px-3 py-2 text-[12px]">
              <p className="font-medium text-ink">{row.profileName}</p>
              <p className="text-graphite">
                {row.primaryRepName ? `Primary ${row.primaryRepName}` : 'No primary'} ·{' '}
                {row.operators.length > 0 ? `Operators ${row.operators.map((rep) => rep.repName).join(', ')}` : 'No operators'}
              </p>
            </div>
          ))}
          {preview.targets.map((row) => (
            <div key={`t:${row.profileId}:${row.activityType}`} className="rounded-lg border border-line bg-bone px-3 py-2 text-[12px]">
              <p className="font-medium text-ink">{row.profileName} · {row.activityType}</p>
              <p className="text-graphite">
                {row.targetCount}/day
                {row.allocations.length > 0 ? ` · ${row.allocations.map((alloc) => `${alloc.repName} ${alloc.targetCount}`).join(', ')}` : ' · shared'}
              </p>
            </div>
          ))}
          {preview.schedules.map((row) => (
            <div key={`s:${row.profileId}:${row.repId}`} className="rounded-lg border border-line bg-bone px-3 py-2 text-[12px]">
              <p className="font-medium text-ink">{row.profileName} · {row.repName}</p>
              <p className="text-graphite">{row.daysOfWeek.map((day) => DAY_LABELS[day]).join(', ')}</p>
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-1 rounded-lg border border-line bg-bone px-3 py-2">
          {results.map((row) => (
            <p key={row} className="text-[12px] text-graphite">{row}</p>
          ))}
        </div>
      )}

      {error && <p role="alert" className="text-[12px] text-status-danger">{error}</p>}

      <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
        <V4Chip>{preview.assignments.length + preview.targets.length + preview.schedules.length} changes</V4Chip>
        <button
          type="button"
          onClick={() => void apply()}
          disabled={busy || empty}
          className="rounded-lg bg-solid px-3 py-2 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Applying…' : 'Apply changes'}
        </button>
      </div>
      </div>
    </V4Drawer>
  )
}
