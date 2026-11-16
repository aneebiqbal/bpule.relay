'use client'

/**
 * Setup Assistant — guided configuration with the current state first.
 *
 * Guide mode: pick a real account, see its current chain and plan, edit
 * operators/targets/schedule, compare before/after, then apply through the
 * canonical writers. Describe mode: natural language → validated preview.
 * Nothing is applied without an explicit Apply; AI only produces drafts.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { V4Drawer, V4Chip } from '@/components/v4/primitives'
import { cn } from 'cn'

interface SetupAccount {
  identityId: string
  profileId: string
  profileName: string
  channel: string
  identityName: string
  primary: { repId: string; repName: string } | null
  operators: Array<{ repId: string; repName: string }>
  backups: Array<{ repId: string; repName: string }>
  targets: Array<{
    activityType: string
    label: string
    targetCount: number
    allocations: Array<{ repId: string; repName: string; targetCount: number }>
  }>
  shared: boolean
}

interface RepOption {
  id: string
  name: string
}

const METRICS = [
  { value: 'connection_request', label: 'Connections' },
  { value: 'dm', label: 'Messages' },
  { value: 'followup', label: 'Follow-ups' },
  { value: 'application', label: 'Applications' },
  { value: 'proposal', label: 'Proposals' },
  { value: 'prospect_extracted', label: 'Prospects' },
  { value: 'other', label: 'Tasks' },
]

const PERIODS = [
  { value: 'DAY', label: 'Daily' },
  { value: 'WEEK', label: 'Weekly' },
  { value: 'MONTH', label: 'Monthly' },
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
  const [mode, setMode] = useState<'guide' | 'describe'>('guide')
  const [accounts, setAccounts] = useState<SetupAccount[]>([])
  const [stateReps, setStateReps] = useState<RepOption[]>(reps)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<string[]>([])

  const [accountQuery, setAccountQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [operatorQuery, setOperatorQuery] = useState('')

  const [primaryRepId, setPrimaryRepId] = useState('')
  const [operatorIds, setOperatorIds] = useState<string[]>([])
  const [backupIds, setBackupIds] = useState<string[]>([])
  const [metric, setMetric] = useState('connection_request')
  const [targetCount, setTargetCount] = useState('20')
  const [period, setPeriod] = useState('DAY')
  const [allocations, setAllocations] = useState<Record<string, string>>({})
  const [days, setDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]))
  const [dirty, setDirty] = useState(false)

  // Describe mode
  const [prompt, setPrompt] = useState('')
  const [preview, setPreview] = useState<{
    assignments: Array<{ profileId: string; profileName: string; primaryRepId: string | null; primaryRepName: string | null; operators: Array<{ repId: string; repName: string }>; backups: Array<{ repId: string; repName: string }> }>
    targets: Array<{ profileId: string; profileName: string; identityId: string; activityType: string; targetCount: number; allocations: Array<{ repId: string; repName: string; targetCount: number }> }>
    schedules: Array<{ profileId: string; repId: string; daysOfWeek: number[] }>
  }>({ assignments: [], targets: [], schedules: [] })
  const [warnings, setWarnings] = useState<string[]>([])

  const selected = useMemo(
    () => accounts.find((account) => account.identityId === selectedId) ?? null,
    [accounts, selectedId],
  )

  useEffect(() => {
    if (!open || mode !== 'guide') return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/team/setup/state')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'Could not load the current configuration.')
        if (cancelled) return
        setAccounts(body.accounts ?? [])
        setStateReps(body.reps ?? reps)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the current configuration.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, mode, reps])

  const filteredAccounts = useMemo(() => {
    const q = accountQuery.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter((account) =>
      `${account.profileName} ${account.identityName} ${account.channel}`.toLowerCase().includes(q),
    )
  }, [accounts, accountQuery])

  function selectAccount(identityId: string) {
    const account = accounts.find((row) => row.identityId === identityId)
    if (!account) return
    setSelectedId(identityId)
    setPrimaryRepId(account.primary?.repId ?? '')
    setOperatorIds(account.operators.map((row) => row.repId))
    setBackupIds(account.backups.map((row) => row.repId))
    const first = account.targets[0]
    setMetric(first?.activityType ?? 'connection_request')
    setTargetCount(String(first?.targetCount ?? 20))
    setAllocations(
      Object.fromEntries(
        (first?.allocations ?? []).map((row) => [row.repId, String(row.targetCount)]),
      ),
    )
    setPeriod('DAY')
    setOperatorQuery('')
    setDirty(false)
    setResults([])
  }

  function toggleSet<T>(set: Set<T>, id: T): Set<T> {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  function toggleOperator(repId: string) {
    setOperatorIds((current) => (current.includes(repId) ? current.filter((id) => id !== repId) : [...current, repId]))
    setDirty(true)
  }

  function toggleBackup(repId: string) {
    setBackupIds((current) => (current.includes(repId) ? current.filter((id) => id !== repId) : [...current, repId]))
    setDirty(true)
  }

  const operatorOptions = useMemo(() => {
    const q = operatorQuery.trim().toLowerCase()
    const chosen = new Set([primaryRepId, ...operatorIds, ...backupIds])
    return stateReps
      .filter((rep) => !chosen.has(rep.id))
      .filter((rep) => (q ? rep.name.toLowerCase().includes(q) : true))
  }, [stateReps, operatorQuery, primaryRepId, operatorIds, backupIds])

  const proposedTotal = [primaryRepId, ...operatorIds].filter(Boolean).length
  const allocationSum = Object.values(allocations).reduce((sum, value) => sum + (Math.round(Number(value)) || 0), 0)
  const targetValue = Math.round(Number(targetCount)) || 0
  const allocationOverflow = allocationSum > targetValue

  async function parsePrompt() {
    setLoading(true)
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
      setPreview(body.preview ?? { assignments: [], targets: [], schedules: [] })
      setWarnings(body.warnings ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse that request.')
    } finally {
      setLoading(false)
    }
  }

  async function applyGuide() {
    if (!selected) return
    setLoading(true)
    setError(null)
    setResults([])
    const log: string[] = []
    try {
      const assignment = await fetch('/api/team/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{
            profileId: selected.profileId,
            primaryRepId: primaryRepId || undefined,
            operators: operatorIds.map((repId, index) => ({ repId, priority: index + 1 })),
            backups: backupIds.map((repId, index) => ({ repId, priority: index + 1 })),
          }],
        }),
      })
      const assignmentBody = await assignment.json().catch(() => ({}))
      if (!assignment.ok) throw new Error(assignmentBody.error ?? 'Assignment failed.')
      const row = (assignmentBody.results ?? [])[0]
      log.push(`${selected.profileName} · ${selected.channel}: ${row?.ok ? 'chain saved' : row?.error ?? 'failed'}`)

      if (targetValue > 0) {
        const target = await fetch('/api/admin/targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repId: primaryRepId || operatorIds[0],
            revenueIdentityId: selected.identityId,
            activityType: metric,
            targetCount: targetValue,
          }),
        })
        const targetBody = await target.json().catch(() => ({}))
        if (!target.ok) {
          log.push(`${selected.identityName}: target failed (${targetBody.error ?? 'error'})`)
        } else {
          const plan = targetBody.target ?? (Array.isArray(targetBody.targets) ? targetBody.targets[0] : null)
          const shares = Object.entries(allocations)
            .filter(([, value]) => (Math.round(Number(value)) || 0) > 0)
            .map(([repId, value]) => ({ repId, targetCount: Math.round(Number(value)) }))
          if (plan?.id && shares.length > 0) {
            const alloc = await fetch(`/api/admin/targets/${plan.id}/allocations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mode: 'allocated', allocations: shares }),
            })
            const allocBody = await alloc.json().catch(() => ({}))
            log.push(`${selected.identityName}: ${alloc.ok ? 'targets allocated' : `allocation failed (${allocBody.error ?? 'error'})`}`)
          } else {
            log.push(`${selected.identityName}: target set`)
          }
        }
      }

      if (days.size > 0 && primaryRepId) {
        const schedule = await fetch(`/api/team/profiles/${selected.profileId}/schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shifts: [{ repId: primaryRepId, startTime: '09:00', endTime: '18:00', daysOfWeek: [...days].sort() }] }),
        })
        const scheduleBody = await schedule.json().catch(() => ({}))
        log.push(`${selected.identityName}: ${schedule.ok ? 'schedule set' : `schedule failed (${scheduleBody.error ?? 'error'})`}`)
      }

      setResults(log)
      setDirty(false)
      router.refresh()
      // Reload current state so the before/after reflects what was just saved.
      const refreshed = await fetch('/api/team/setup/state').then((res) => res.json().catch(() => null))
      if (refreshed?.accounts) {
        setAccounts(refreshed.accounts)
        if (selectedId) selectAccount(selectedId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply the setup.')
    } finally {
      setLoading(false)
    }
  }

  async function applyDescribe() {
    setLoading(true)
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
          log.push(`${row.profileId}: ${row.ok ? 'assigned' : row.error ?? 'failed'}`)
        }
      }
      for (const row of preview.targets) {
        const res = await fetch('/api/admin/targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repId: row.allocations[0]?.repId ?? preview.assignments.find((a) => a.profileId === row.profileId)?.primaryRepId,
            revenueIdentityId: row.identityId,
            activityType: row.activityType,
            targetCount: row.targetCount,
          }),
        })
        const body = await res.json().catch(() => ({}))
        log.push(`${row.profileName}: ${res.ok ? 'target set' : `target failed (${body.error ?? 'error'})`}`)
      }
      setResults(log)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply the setup.')
    } finally {
      setLoading(false)
    }
  }

  const guideChanges = selected && primaryRepId && dirty
  const describeChanges = preview.assignments.length + preview.targets.length + preview.schedules.length > 0

  return (
    <V4Drawer
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title={
        <div>
          <p className="text-[15px] font-medium text-ink">Setup assistant</p>
          <p className="mt-0.5 text-[12px] text-stone">See the current configuration, propose a change, then apply it.</p>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <div className="flex rounded-lg border border-line bg-bone-raised p-0.5">
          {(['guide', 'describe'] as const).map((option) => (
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
              {option === 'guide' ? 'Guided' : 'Describe'}
            </button>
          ))}
        </div>

        {mode === 'guide' ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="space-y-2">
              <input
                type="search"
                value={accountQuery}
                onChange={(event) => setAccountQuery(event.target.value)}
                placeholder="Search person or account…"
                aria-label="Search person or account"
                className="h-9 w-full rounded-lg border border-line bg-bone-raised px-3 text-[13px] text-ink placeholder:text-stone"
              />
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Current configuration</p>
              <div className="max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
                {loading ? (
                  <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[12px] text-graphite">Loading…</p>
                ) : filteredAccounts.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[12px] text-graphite">No accounts match.</p>
                ) : (
                  filteredAccounts.map((account) => (
                    <button
                      key={account.identityId}
                      type="button"
                      onClick={() => selectAccount(account.identityId)}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                        selectedId === account.identityId
                          ? 'border-line bg-bone-raised ring-1 ring-line'
                          : 'border-line/70 hover:bg-bone-raised',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-medium text-ink">{account.profileName}</span>
                        <V4Chip>{account.channel}</V4Chip>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-stone">{account.identityName}</span>
                      <span className="mt-1 block text-[11px] text-graphite">
                        {account.primary ? `Primary ${account.primary.repName}` : 'No primary'}
                        {account.operators.length > 0 ? ` · ${account.operators.length} operator${account.operators.length === 1 ? '' : 's'}` : ''}
                        {account.targets.length > 0 ? ` · ${account.targets[0].targetCount} ${account.targets[0].label.toLowerCase()}` : ''}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-3">
              {!selected ? (
                <p className="rounded-lg border border-dashed border-line px-3 py-8 text-center text-[13px] text-graphite">
                  Select an account to see and edit its configuration.
                </p>
              ) : (
                <>
                  <div className="rounded-xl border border-line bg-bone-raised p-3">
                    <p className="truncate text-[13px] font-medium text-ink">{selected.profileName} · {selected.identityName}</p>
                    <p className="text-[11px] text-stone">{selected.channel}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selected.primary ? (
                        <V4Chip tone="info">Primary {selected.primary.repName}</V4Chip>
                      ) : (
                        <V4Chip tone="warning">No primary</V4Chip>
                      )}
                      {selected.operators.map((row) => <V4Chip key={row.repId}>Operator {row.repName}</V4Chip>)}
                      {selected.backups.map((row) => <V4Chip key={row.repId}>Backup {row.repName}</V4Chip>)}
                    </div>
                  </div>

                  <div>
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Primary operator</span>
                      <select
                        value={primaryRepId}
                        onChange={(event) => { setPrimaryRepId(event.target.value); setDirty(true) }}
                        className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
                      >
                        <option value="">Choose…</option>
                        {stateReps.map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
                      </select>
                    </label>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Operators</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {operatorIds.map((repId) => {
                        const rep = stateReps.find((row) => row.id === repId)
                        return (
                          <button key={repId} type="button" onClick={() => toggleOperator(repId)} className="rounded-full border border-line bg-bone px-2.5 py-1 text-[11px] text-ink hover:bg-bone-raised">
                            {rep?.name ?? repId} ×
                          </button>
                        )
                      })}
                      {operatorIds.length === 0 && <span className="text-[11px] text-stone">None</span>}
                    </div>
                    <input
                      type="search"
                      value={operatorQuery}
                      onChange={(event) => setOperatorQuery(event.target.value)}
                      placeholder="Add operator…"
                      aria-label="Add operator"
                      className="mt-1.5 h-9 w-full rounded-md border border-line bg-bone px-2 text-[12px] text-ink placeholder:text-stone"
                    />
                    {operatorOptions.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {operatorOptions.slice(0, 6).map((rep) => (
                          <button key={rep.id} type="button" onClick={() => toggleOperator(rep.id)} className="rounded-full border border-line/70 px-2.5 py-1 text-[11px] text-graphite hover:text-ink">
                            + {rep.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Backups</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {backupIds.map((repId) => {
                        const rep = stateReps.find((row) => row.id === repId)
                        return (
                          <button key={repId} type="button" onClick={() => toggleBackup(repId)} className="rounded-full border border-line/70 px-2.5 py-1 text-[11px] text-graphite hover:text-ink">
                            {rep?.name ?? repId} ×
                          </button>
                        )
                      })}
                      {backupIds.length === 0 && <span className="text-[11px] text-stone">None</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Metric</span>
                      <select value={metric} onChange={(event) => { setMetric(event.target.value); setDirty(true) }} className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink">
                        {METRICS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Target</span>
                      <input type="number" min={1} value={targetCount} onChange={(event) => { setTargetCount(event.target.value); setDirty(true) }} className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] tabular-nums text-ink" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Period</span>
                      <select value={period} onChange={(event) => setPeriod(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink">
                        {PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Schedule</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {DAY_LABELS.map((label, day) => (
                          <button
                            key={label}
                            type="button"
                            aria-pressed={days.has(day)}
                            onClick={() => { setDays((current) => toggleSet(current, day)); setDirty(true) }}
                            className={cn('rounded-full border px-1.5 py-1 text-[10px]', days.has(day) ? 'border-line bg-bone text-ink' : 'border-line/70 text-graphite')}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {proposedTotal > 1 && (
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Allocation (optional)</span>
                      <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {[primaryRepId, ...operatorIds].filter(Boolean).map((repId) => {
                          const rep = stateReps.find((row) => row.id === repId)
                          return (
                            <label key={repId} className="block">
                              <span className="text-[10px] text-stone">{rep?.name ?? repId}</span>
                              <input
                                type="number"
                                min={0}
                                value={allocations[repId] ?? ''}
                                onChange={(event) => { setAllocations((current) => ({ ...current, [repId]: event.target.value })); setDirty(true) }}
                                className="mt-0.5 h-8 w-full rounded-md border border-line bg-bone px-1.5 text-[12px] tabular-nums text-ink"
                              />
                            </label>
                          )
                        })}
                      </div>
                      <p className={cn('mt-1 text-[11px]', allocationOverflow ? 'text-status-danger' : 'text-stone')}>
                        Allocated {allocationSum} of {targetValue}
                      </p>
                    </div>
                  )}

                  <div className="rounded-lg border border-line bg-bone px-3 py-2 text-[12px]">
                    <p className="font-medium text-ink">Before → After</p>
                    <p className="mt-1 text-graphite">
                      Primary: {selected.primary?.repName ?? '—'} → {stateReps.find((r) => r.id === primaryRepId)?.name ?? '—'}
                    </p>
                    <p className="text-graphite">
                      Operators: {selected.operators.map((r) => r.repName).join(', ') || '—'} → {operatorIds.map((id) => stateReps.find((r) => r.id === id)?.name).filter(Boolean).join(', ') || '—'}
                    </p>
                    <p className="text-graphite">
                      Target: {selected.targets[0] ? `${selected.targets[0].targetCount} ${selected.targets[0].label}` : '—'} → {targetValue} {METRICS.find((m) => m.value === metric)?.label}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">What should change?</span>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
                placeholder="Assign Ahmad and Dawood to Aneeb's LinkedIn account, split connection targets 60/40, weekdays."
                className="mt-1 w-full rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] text-ink placeholder:text-stone"
              />
            </label>
            <button
              type="button"
              onClick={() => void parsePrompt()}
              disabled={loading || prompt.trim().length < 8}
              className="rounded-lg bg-solid px-3 py-2 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Working…' : 'Preview request'}
            </button>
            {warnings.length > 0 && (
              <div className="rounded-lg border border-status-warning/30 bg-status-warning/5 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-status-warning">Could not resolve</p>
                <ul className="mt-1 space-y-0.5 text-[12px] text-graphite">
                  {warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            )}
            {describeChanges === false ? (
              <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[13px] text-graphite">Nothing to preview yet.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Proposed (not applied)</p>
                {preview.assignments.map((row) => (
                  <div key={`a:${row.profileId}`} className="rounded-lg border border-line bg-bone px-3 py-2 text-[12px]">
                    <p className="font-medium text-ink">{row.profileName}</p>
                    <p className="text-graphite">{row.primaryRepName ? `Primary ${row.primaryRepName}` : 'No primary'} · {row.operators.map((rep) => rep.repName).join(', ') || 'No operators'}</p>
                  </div>
                ))}
                {preview.targets.map((row) => (
                  <div key={`t:${row.profileId}:${row.activityType}`} className="rounded-lg border border-line bg-bone px-3 py-2 text-[12px]">
                    <p className="font-medium text-ink">{row.profileName}</p>
                    <p className="text-graphite">{row.targetCount} {row.activityType}{row.allocations.length > 0 ? ` · ${row.allocations.map((a) => `${a.repName} ${a.targetCount}`).join(', ')}` : ''}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-1 rounded-lg border border-line bg-bone px-3 py-2">
            {results.map((row) => <p key={row} className="text-[12px] text-graphite">{row}</p>)}
          </div>
        )}
        {error && <p role="alert" className="text-[12px] text-status-danger">{error}</p>}

        <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
          <V4Chip>
            {mode === 'guide'
              ? selected
                ? dirty ? 'Unsaved changes' : 'No changes'
                : 'Select an account'
              : `${preview.assignments.length + preview.targets.length} proposed`}
          </V4Chip>
          <button
            type="button"
            onClick={() => (mode === 'guide' ? void applyGuide() : void applyDescribe())}
            disabled={loading || (mode === 'guide' ? !guideChanges || allocationOverflow || !primaryRepId : !describeChanges)}
            className="rounded-lg bg-solid px-3 py-2 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Applying…' : 'Apply changes'}
          </button>
        </div>
      </div>
    </V4Drawer>
  )
}
