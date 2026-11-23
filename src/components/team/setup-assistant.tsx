'use client'

/**
 * Setup Assistant — see the current configuration, propose a change, then apply.
 *
 * Three ways in, one canonical out:
 *   Quick presets — one tap fills a real, org-aware request.
 *   Guided        — pick an account, edit the chain/plan/schedule, apply directly.
 *   Describe      — natural language OR the structured builder; AI only drafts a
 *                   validated preview, never a write.
 * Nothing is applied without an explicit Apply.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { V4Drawer, V4Chip } from '@/components/v4/primitives'
import { cn } from 'cn'
import { ChannelBadge } from '@/components/ui/channel-badge'

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

interface Preview {
  assignments: Array<{ profileId: string; profileName: string; primaryRepId: string | null; primaryRepName: string | null; operators: Array<{ repId: string; repName: string }>; backups: Array<{ repId: string; repName: string }> }>
  targets: Array<{ profileId: string; profileName: string; identityId: string; activityType: string; targetCount: number; allocations: Array<{ repId: string; repName: string; targetCount: number }> }>
  schedules: Array<{ profileId: string; repId: string; daysOfWeek: number[] }>
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

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const DAY_PRESETS = [
  { key: 'weekdays', label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { key: 'weekends', label: 'Weekends', days: [0, 6] },
  { key: 'every', label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
  { key: 'mwf', label: 'Mon · Wed · Fri', days: [1, 3, 5] },
] as const

const SPLIT_PRESETS = [
  { key: 'equal', label: 'Equal' },
  { key: '60/40', label: '60 / 40' },
  { key: '70/30', label: '70 / 30' },
  { key: 'custom', label: 'Custom' },
] as const

type SplitMode = (typeof SPLIT_PRESETS)[number]['key']

const SPLIT_SHARES: Record<Exclude<SplitMode, 'custom'>, number[]> = {
  equal: [0.5, 0.5],
  '60/40': [0.6, 0.4],
  '70/30': [0.7, 0.3],
}

function names(repIds: string[], reps: RepOption[]): string {
  return repIds.map((id) => reps.find((rep) => rep.id === id)?.name ?? 'Unknown').join(' and ')
}

function dayList(days: Set<number>): string {
  if (days.size === 7) return 'every day'
  if (days.size === 5 && [1, 2, 3, 4, 5].every((day) => days.has(day))) return 'weekdays'
  return [...days].sort().map((day) => DAY_NAMES[day]).join(', ')
}

/**
 * Deterministic preview for the structured paths (presets + builder).
 *
 * Free-text Describe still goes through the model, but anything the admin can
 * pick must not depend on the model reading "60/40" correctly.
 */
function composePreview(
  account: SetupAccount,
  reps: RepOption[],
  opts: {
    assign: boolean
    primary: boolean
    targets: boolean
    schedule: boolean
    operators: string[]
    backups: string[]
    primaryRepId: string
    metric: string
    target: number
    allocations: Array<{ repId: string; targetCount: number }>
    scheduleRepId: string
    days: Set<number>
  },
): Preview {
  const nameOf = (repId: string) => reps.find((rep) => rep.id === repId)?.name ?? 'Unknown'
  const primaryRepId = opts.primary && opts.primaryRepId
    ? opts.primaryRepId
    : opts.primaryRepId || account.primary?.repId || null

  const assignments: Preview['assignments'] = []
  if (opts.assign || opts.primary) {
    assignments.push({
      profileId: account.profileId,
      profileName: account.profileName,
      primaryRepId,
      primaryRepName: primaryRepId ? nameOf(primaryRepId) : null,
      operators: opts.operators.map((repId) => ({ repId, repName: nameOf(repId) })),
      backups: opts.backups.map((repId) => ({ repId, repName: nameOf(repId) })),
    })
  }

  const targets: Preview['targets'] = []
  if (opts.targets && opts.target > 0) {
    targets.push({
      profileId: account.profileId,
      profileName: account.profileName,
      identityId: account.identityId,
      activityType: opts.metric,
      targetCount: opts.target,
      allocations: opts.allocations.map((row) => ({ ...row, repName: nameOf(row.repId) })),
    })
  }

  const schedules: Preview['schedules'] = []
  if (opts.schedule && opts.scheduleRepId && opts.days.size > 0) {
    schedules.push({
      profileId: account.profileId,
      repId: opts.scheduleRepId,
      daysOfWeek: [...opts.days].sort(),
    })
  }

  return { assignments, targets, schedules }
}

function splitAllocations(
  reps: string[],
  target: number,
  mode: SplitMode,
  custom: Record<string, string>,
): Array<{ repId: string; targetCount: number }> {
  if (mode === 'custom') {
    return reps
      .map((repId) => ({ repId, targetCount: Math.round(Number(custom[repId]) || 0) }))
      .filter((row) => row.targetCount > 0)
  }
  const shares = SPLIT_SHARES[mode]
  let assigned = 0
  return reps.map((repId, index) => {
    const share = shares[index] ?? shares[shares.length - 1] ?? 0
    const value = index === reps.length - 1 ? target - assigned : Math.round(target * share)
    const safe = Math.max(0, value)
    assigned += safe
    return { repId, targetCount: safe }
  })
}

export function SetupAssistant({
  open,
  onClose,
  reps,
  canManageTargets,
}: {
  open: boolean
  onClose: () => void
  profiles: Array<{ id: string; name: string }>
  reps: Array<{ id: string; name: string }>
  identities: Array<{ id: string; profileId: string; channel: string; name: string }>
  /** Target writes require MANAGE_TEAM_TARGETS, which the setup entry gate may not grant. */
  canManageTargets: boolean
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'guide' | 'describe'>('describe')
  const [accounts, setAccounts] = useState<SetupAccount[]>([])
  const [stateReps, setStateReps] = useState<RepOption[]>(reps)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<string[]>([])

  // ── Guide ────────────────────────────────────────────────────────────────
  const [accountQuery, setAccountQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [operatorQuery, setOperatorQuery] = useState('')
  const [primaryRepId, setPrimaryRepId] = useState('')
  const [operatorIds, setOperatorIds] = useState<string[]>([])
  const [backupIds, setBackupIds] = useState<string[]>([])
  const [metric, setMetric] = useState('connection_request')
  const [targetCount, setTargetCount] = useState('20')
  const [allocations, setAllocations] = useState<Record<string, string>>({})
  const [splitMode, setSplitMode] = useState<SplitMode>('equal')
  const [days, setDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]))
  const [dirty, setDirty] = useState(false)

  // ── Describe / builder ───────────────────────────────────────────────────
  const [prompt, setPrompt] = useState('')
  const [builderOpen, setBuilderOpen] = useState(true)
  const [builderAccount, setBuilderAccount] = useState('')
  const [actions, setActions] = useState({ assign: true, primary: false, targets: true, schedule: false })
  const [builderOperators, setBuilderOperators] = useState<string[]>([])
  const [builderBackups, setBuilderBackups] = useState<string[]>([])
  const [builderPrimary, setBuilderPrimary] = useState('')
  const [builderMetric, setBuilderMetric] = useState('connection_request')
  const [builderTarget, setBuilderTarget] = useState('20')
  const [builderSplit, setBuilderSplit] = useState<SplitMode>('equal')
  const [builderCustom, setBuilderCustom] = useState<Record<string, string>>({})
  const [builderRep, setBuilderRep] = useState('')
  const [builderDays, setBuilderDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]))

  const [preview, setPreview] = useState<Preview>({ assignments: [], targets: [], schedules: [] })
  const [warnings, setWarnings] = useState<string[]>([])

  const selected = useMemo(
    () => accounts.find((account) => account.identityId === selectedId) ?? null,
    [accounts, selectedId],
  )
  const builderAccountRow = useMemo(
    () => accounts.find((account) => account.identityId === builderAccount) ?? null,
    [accounts, builderAccount],
  )

  useEffect(() => {
    if (!open) return
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
  }, [open, reps])

  const filteredAccounts = useMemo(() => {
    const q = accountQuery.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter((account) =>
      `${account.profileName} ${account.identityName} ${account.channel}`.toLowerCase().includes(q),
    )
  }, [accounts, accountQuery])

  // ── Guide helpers ────────────────────────────────────────────────────────
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
    setSplitMode('equal')
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

  const guideReps = [primaryRepId, ...operatorIds].filter(Boolean)
  const guideTarget = Math.round(Number(targetCount)) || 0

  function applyGuideSplit(mode: SplitMode) {
    setSplitMode(mode)
    if (mode === 'custom') {
      setDirty(true)
      return
    }
    const shares = SPLIT_SHARES[mode]
    const seats = guideReps
    const next: Record<string, string> = {}
    let assigned = 0
    seats.forEach((repId, index) => {
      const share = shares[index] ?? shares[shares.length - 1] ?? 0
      const value = index === seats.length - 1 ? guideTarget - assigned : Math.round(guideTarget * share)
      next[repId] = String(Math.max(0, value))
      assigned += Math.max(0, value)
    })
    setAllocations(next)
    setDirty(true)
  }

  // ── Describe builder ─────────────────────────────────────────────────────
  const builderReps = [builderPrimary, ...builderOperators].filter(Boolean)
  const builderTargetValue = Math.round(Number(builderTarget)) || 0

  function applyBuilderSplit(mode: SplitMode) {
    setBuilderSplit(mode)
    if (mode === 'custom') return
    const shares = SPLIT_SHARES[mode]
    const next: Record<string, string> = {}
    let assigned = 0
    builderReps.forEach((repId, index) => {
      const share = shares[index] ?? shares[shares.length - 1] ?? 0
      const value = index === builderReps.length - 1 ? builderTargetValue - assigned : Math.round(builderTargetValue * share)
      next[repId] = String(Math.max(0, value))
      assigned += Math.max(0, value)
    })
    setBuilderCustom(next)
  }

  function buildPrompt(): string {
    const account = builderAccountRow
    if (!account) return ''
    const where = `${account.profileName}'s ${account.channel} account`
    const parts: string[] = []
    if (actions.assign && builderOperators.length > 0) {
      parts.push(`Assign ${names(builderOperators, stateReps)} as ${builderOperators.length === 1 ? 'operator' : 'operators'} on ${where}`)
    }
    if (actions.assign && builderBackups.length > 0) {
      parts.push(`add ${names(builderBackups, stateReps)} as ${builderBackups.length === 1 ? 'backup' : 'backups'}`)
    }
    if (actions.primary && builderPrimary) {
      parts.push(`set ${names([builderPrimary], stateReps)} as primary`)
    }
    if (actions.targets && builderTargetValue > 0) {
      const label = METRICS.find((m) => m.value === builderMetric)?.label ?? 'targets'
      const shares = builderSplit === 'custom'
        ? builderReps.map((repId) => `${stateReps.find((r) => r.id === repId)?.name ?? repId} ${Math.round(Number(builderCustom[repId]) || 0)}`).join(', ')
        : builderSplit
      parts.push(`set ${builderTargetValue} ${label.toLowerCase()} per day split ${shares} between ${names(builderReps, stateReps)}`)
    }
    if (actions.schedule && builderRep && builderDays.size > 0) {
      parts.push(`schedule ${names([builderRep], stateReps)} on ${dayList(builderDays)} 09:00-18:00`)
    }
    const text = parts.join('. ').replace(/\.\s+/g, '. ').trim()
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
  }

  function fillFromBuilder() {
    const account = builderAccountRow
    if (!account) {
      setError('Pick an account first.')
      return
    }
    const text = buildPrompt()
    setPrompt(text.charAt(0).toUpperCase() + text.slice(1) + '.')
    setPreview(
      composePreview(account, stateReps, {
        assign: actions.assign,
        primary: actions.primary,
        targets: actions.targets,
        schedule: actions.schedule,
        operators: builderOperators,
        backups: builderBackups,
        primaryRepId: builderPrimary,
        metric: builderMetric,
        target: builderTargetValue,
        allocations: splitAllocations(builderReps, builderTargetValue, builderSplit, builderCustom),
        scheduleRepId: builderRep,
        days: builderDays,
      }),
    )
    setWarnings([])
    setError(null)
  }

  function applyPreset(preset: 'assign' | 'split' | 'primary' | 'schedule' | 'full') {
    const account = builderAccountRow ?? accounts[0]
    if (!account) return
    setBuilderAccount(account.identityId)
    const others = stateReps.filter((rep) => rep.id !== account.primary?.repId)
    const first = others[0]?.id ?? ''
    const second = others[1]?.id ?? ''
    const primary = account.primary?.repId ?? first
    const where = `${account.profileName}'s ${account.channel} account`

    if (preset === 'assign') {
      const operators = [first, second].filter(Boolean)
      setActions({ assign: true, primary: false, targets: false, schedule: false })
      setBuilderOperators(operators)
      setBuilderBackups([])
      setBuilderPrimary(primary)
      setPrompt(`Assign ${names(operators, stateReps)} as operators on ${where}, weekdays.`)
      setPreview(composePreview(account, stateReps, {
        assign: true, primary: false, targets: false, schedule: false,
        operators, backups: [], primaryRepId: primary, metric: 'connection_request', target: 0,
        allocations: [], scheduleRepId: '', days: new Set(),
      }))
    } else if (preset === 'split') {
      const operators = [second].filter(Boolean)
      setActions({ assign: true, primary: false, targets: true, schedule: false })
      setBuilderOperators(operators)
      setBuilderPrimary(primary)
      setBuilderTarget('20')
      setBuilderSplit('60/40')
      setPrompt(`Split ${where} connections 60/40 between ${names([primary, ...operators].filter(Boolean), stateReps)}, 20 per day.`)
      setPreview(composePreview(account, stateReps, {
        assign: true, primary: false, targets: true, schedule: false,
        operators, backups: [], primaryRepId: primary, metric: 'connection_request', target: 20,
        allocations: splitAllocations([primary, ...operators].filter(Boolean), 20, '60/40', {}),
        scheduleRepId: '', days: new Set(),
      }))
    } else if (preset === 'primary') {
      setActions({ assign: false, primary: true, targets: false, schedule: false })
      setBuilderPrimary(first)
      setPrompt(`Set ${names([first], stateReps)} as primary on ${where}.`)
      setPreview(composePreview(account, stateReps, {
        assign: false, primary: true, targets: false, schedule: false,
        operators: [], backups: [], primaryRepId: first, metric: 'connection_request', target: 0,
        allocations: [], scheduleRepId: '', days: new Set(),
      }))
    } else if (preset === 'schedule') {
      const days = new Set([1, 2, 3, 4, 5])
      setActions({ assign: false, primary: false, targets: false, schedule: true })
      setBuilderRep(primary)
      setBuilderDays(days)
      setPrompt(`Schedule ${names([primary], stateReps)} on ${where}, weekdays 09:00-18:00.`)
      setPreview(composePreview(account, stateReps, {
        assign: false, primary: false, targets: false, schedule: true,
        operators: [], backups: [], primaryRepId: '', metric: 'connection_request', target: 0,
        allocations: [], scheduleRepId: primary, days,
      }))
    } else {
      const operators = [second].filter(Boolean)
      const days = new Set([1, 2, 3, 4, 5])
      setActions({ assign: true, primary: true, targets: true, schedule: true })
      setBuilderOperators(operators)
      setBuilderPrimary(primary)
      setBuilderTarget('20')
      setBuilderSplit('equal')
      setBuilderRep(primary)
      setBuilderDays(days)
      setPrompt(
        `Full setup for ${where}: primary ${names([primary], stateReps)}, operators ${names(operators, stateReps)}, ` +
          `20 connections per day split equally, scheduled weekdays 09:00-18:00.`,
      )
      setPreview(composePreview(account, stateReps, {
        assign: true, primary: true, targets: true, schedule: true,
        operators, backups: [], primaryRepId: primary, metric: 'connection_request', target: 20,
        allocations: splitAllocations([primary, ...operators].filter(Boolean), 20, 'equal', {}),
        scheduleRepId: primary, days,
      }))
    }
    setWarnings([])
    setError(null)
  }

  // ── Network ──────────────────────────────────────────────────────────────
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

      if (guideTarget > 0) {
        if (!canManageTargets) {
          log.push(`${selected.identityName}: target not written (MANAGE_TEAM_TARGETS required)`)
        } else {
          const target = await fetch('/api/admin/targets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              repId: primaryRepId || operatorIds[0],
              revenueIdentityId: selected.identityId,
              activityType: metric,
              targetCount: guideTarget,
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
      // Schedules were parsed but never applied — the preview promised them.
      for (const row of preview.schedules) {
        const res = await fetch(`/api/team/profiles/${row.profileId}/schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shifts: [{ repId: row.repId, startTime: '09:00', endTime: '18:00', daysOfWeek: row.daysOfWeek }] }),
        })
        const body = await res.json().catch(() => ({}))
        log.push(`${accounts.find((account) => account.profileId === row.profileId)?.profileName ?? row.profileId}: ${res.ok ? 'schedule set' : `schedule failed (${body.error ?? 'error'})`}`)
      }
      setResults(log)
      router.refresh()
      const refreshed = await fetch('/api/team/setup/state').then((res) => res.json().catch(() => null))
      if (refreshed?.accounts) setAccounts(refreshed.accounts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply the setup.')
    } finally {
      setLoading(false)
    }
  }

  const allocationSum = Object.values(allocations).reduce((sum, value) => sum + (Math.round(Number(value)) || 0), 0)
  const allocationOverflow = allocationSum > guideTarget
  const guideChanges = selected && primaryRepId && dirty
  const describeChanges = preview.assignments.length + preview.targets.length + preview.schedules.length > 0

  const previewRows = useMemo(() => {
    const rows: Array<{ key: string; title: string; before: string; after: string }> = []
    for (const row of preview.assignments) {
      const current = accounts.find((account) => account.profileId === row.profileId)
      rows.push({
        key: `a:${row.profileId}`,
        title: row.profileName,
        before: current ? `Primary ${current.primary?.repName ?? '—'} · ${current.operators.length} operators` : '—',
        after: `Primary ${row.primaryRepName ?? '—'} · ${row.operators.map((rep) => rep.repName).join(', ') || 'none'}`,
      })
    }
    for (const row of preview.targets) {
      const current = accounts.find((account) => account.profileId === row.profileId)
      const lane = current?.targets.find((target) => target.activityType === row.activityType)
      rows.push({
        key: `t:${row.profileId}:${row.activityType}`,
        title: row.profileName,
        before: lane ? `${lane.targetCount} ${lane.label}` : '—',
        after: `${row.targetCount} ${METRICS.find((m) => m.value === row.activityType)?.label ?? row.activityType}${row.allocations.length > 0 ? ` · ${row.allocations.map((a) => `${a.repName} ${a.targetCount}`).join(', ')}` : ''}`,
      })
    }
    for (const row of preview.schedules) {
      rows.push({
        key: `s:${row.profileId}:${row.repId}`,
        title: accounts.find((account) => account.profileId === row.profileId)?.profileName ?? row.profileId,
        before: '—',
        after: `${row.repId ? stateReps.find((rep) => rep.id === row.repId)?.name ?? row.repId : '—'} · ${dayList(new Set(row.daysOfWeek))}`,
      })
    }
    return rows
  }, [preview, accounts, stateReps])

  return (
    <V4Drawer
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title={
        <div>
          <p className="text-[15px] font-medium text-ink">Setup assistant</p>
          <p className="mt-0.5 text-[12px] text-stone">Pick a preset, build a request, or describe it — then preview before anything is applied.</p>
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
                        <ChannelBadge channel={account.channel} />
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
                    <p className="mt-1"><ChannelBadge channel={selected.channel} /></p>
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

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Metric</span>
                      <select value={metric} onChange={(event) => { setMetric(event.target.value); setDirty(true) }} className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink">
                        {METRICS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Target / day</span>
                      <input type="number" min={1} value={targetCount} onChange={(event) => { setTargetCount(event.target.value); applyGuideSplit(splitMode) }} className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] tabular-nums text-ink" />
                    </label>
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Split</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {SPLIT_PRESETS.map((preset) => (
                          <button
                            key={preset.key}
                            type="button"
                            aria-pressed={splitMode === preset.key}
                            onClick={() => applyGuideSplit(preset.key)}
                            className={cn('rounded-full border px-2 py-1 text-[10px]', splitMode === preset.key ? 'border-line bg-bone text-ink' : 'border-line/70 text-graphite')}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Schedule</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {DAY_PRESETS.map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => { setDays(new Set(preset.days)); setDirty(true) }}
                          className={cn('rounded-full border px-2 py-1 text-[10px]', days.size === preset.days.length && preset.days.every((day) => days.has(day)) ? 'border-line bg-bone text-ink' : 'border-line/70 text-graphite')}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
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

                  {guideReps.length > 1 && (
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Allocation</span>
                      <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {guideReps.map((repId) => {
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
                        Allocated {allocationSum} of {guideTarget}
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
                      Target: {selected.targets[0] ? `${selected.targets[0].targetCount} ${selected.targets[0].label}` : '—'} → {guideTarget} {METRICS.find((m) => m.value === metric)?.label}
                    </p>
                    <p className="text-graphite">Schedule: {dayList(days)}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Start from a preset</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {([
                  { key: 'assign', label: 'Assign operators' },
                  { key: 'split', label: 'Split targets 60/40' },
                  { key: 'primary', label: 'Set primary' },
                  { key: 'schedule', label: 'Weekday schedule' },
                  { key: 'full', label: 'Full setup' },
                ] as const).map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => applyPreset(preset.key)}
                    className="rounded-full border border-line bg-bone-raised px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-bone"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-stone">One tap fills the request using the first account — edit it or pick another below.</p>
            </div>

            <div className="rounded-xl border border-line bg-bone-raised">
              <button
                type="button"
                onClick={() => setBuilderOpen((current) => !current)}
                aria-expanded={builderOpen}
                className="flex w-full items-center justify-between px-3 py-2 text-[12px] font-medium text-ink"
              >
                <span>Build a request</span>
                <span className="text-[11px] text-stone">{builderOpen ? 'Hide' : 'Show'}</span>
              </button>
              {builderOpen && (
                <div className="space-y-3 border-t border-line px-3 py-3">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Account</span>
                    <select
                      value={builderAccount}
                      onChange={(event) => setBuilderAccount(event.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
                    >
                      <option value="">Choose an account…</option>
                      {accounts.map((account) => (
                        <option key={account.identityId} value={account.identityId}>
                          {account.profileName} · {account.identityName} · {account.channel}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Include</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {([
                        { key: 'assign', label: 'Operators' },
                        { key: 'primary', label: 'Primary' },
                        { key: 'targets', label: 'Targets' },
                        { key: 'schedule', label: 'Schedule' },
                      ] as const).map((action) => (
                        <button
                          key={action.key}
                          type="button"
                          aria-pressed={actions[action.key]}
                          onClick={() => setActions((current) => ({ ...current, [action.key]: !current[action.key] }))}
                          className={cn('rounded-full border px-2.5 py-1 text-[11px]', actions[action.key] ? 'border-line bg-bone text-ink' : 'border-line/70 text-graphite')}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {actions.assign && (
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Operators & backups</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {builderOperators.map((repId) => (
                          <button key={repId} type="button" onClick={() => setBuilderOperators((current) => current.filter((id) => id !== repId))} className="rounded-full border border-line bg-bone px-2.5 py-1 text-[11px] text-ink">
                            {stateReps.find((rep) => rep.id === repId)?.name ?? repId} ×
                          </button>
                        ))}
                        {builderBackups.map((repId) => (
                          <button key={repId} type="button" onClick={() => setBuilderBackups((current) => current.filter((id) => id !== repId))} className="rounded-full border border-line/70 px-2.5 py-1 text-[11px] text-graphite">
                            Backup {stateReps.find((rep) => rep.id === repId)?.name ?? repId} ×
                          </button>
                        ))}
                        {builderOperators.length === 0 && builderBackups.length === 0 && <span className="text-[11px] text-stone">None</span>}
                      </div>
                      <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        <select
                          value=""
                          onChange={(event) => {
                            if (!event.target.value) return
                            setBuilderOperators((current) => [...current, event.target.value])
                          }}
                          className="h-9 w-full rounded-md border border-line bg-bone px-2 text-[12px] text-ink"
                          aria-label="Add operator"
                        >
                          <option value="">Add operator…</option>
                          {stateReps
                            .filter((rep) => rep.id !== builderPrimary && !builderOperators.includes(rep.id) && !builderBackups.includes(rep.id))
                            .map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
                        </select>
                        <select
                          value=""
                          onChange={(event) => {
                            if (!event.target.value) return
                            setBuilderBackups((current) => [...current, event.target.value])
                          }}
                          className="h-9 w-full rounded-md border border-line bg-bone px-2 text-[12px] text-ink"
                          aria-label="Add backup"
                        >
                          <option value="">Add backup…</option>
                          {stateReps
                            .filter((rep) => rep.id !== builderPrimary && !builderOperators.includes(rep.id) && !builderBackups.includes(rep.id))
                            .map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  {actions.primary && (
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Primary</span>
                      <select
                        value={builderPrimary}
                        onChange={(event) => setBuilderPrimary(event.target.value)}
                        className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink"
                      >
                        <option value="">Choose…</option>
                        {stateReps.map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
                      </select>
                    </label>
                  )}

                  {actions.targets && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <label className="block">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Metric</span>
                        <select value={builderMetric} onChange={(event) => setBuilderMetric(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink">
                          {METRICS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Target / day</span>
                        <input type="number" min={1} value={builderTarget} onChange={(event) => { setBuilderTarget(event.target.value); applyBuilderSplit(builderSplit) }} className="mt-1 h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] tabular-nums text-ink" />
                      </label>
                      <div>
                        <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Split</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {SPLIT_PRESETS.map((preset) => (
                            <button
                              key={preset.key}
                              type="button"
                              aria-pressed={builderSplit === preset.key}
                              onClick={() => applyBuilderSplit(preset.key)}
                              className={cn('rounded-full border px-2 py-1 text-[10px]', builderSplit === preset.key ? 'border-line bg-bone text-ink' : 'border-line/70 text-graphite')}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {actions.schedule && (
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Schedule</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {DAY_PRESETS.map((preset) => (
                          <button
                            key={preset.key}
                            type="button"
                            onClick={() => setBuilderDays(new Set(preset.days))}
                            className={cn('rounded-full border px-2 py-1 text-[10px]', builderDays.size === preset.days.length && preset.days.every((day) => builderDays.has(day)) ? 'border-line bg-bone text-ink' : 'border-line/70 text-graphite')}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <select
                        value={builderRep}
                        onChange={(event) => setBuilderRep(event.target.value)}
                        className="mt-1.5 h-9 w-full rounded-md border border-line bg-bone px-2 text-[12px] text-ink"
                        aria-label="Schedule rep"
                      >
                        <option value="">Who is scheduled?</option>
                        {stateReps.map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
                      </select>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={fillFromBuilder}
                    className="rounded-lg border border-line bg-bone px-3 py-2 text-[12px] font-medium text-ink transition-colors hover:bg-bone-raised"
                  >
                    Use this request
                  </button>
                </div>
              )}
            </div>

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
              <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center">
                <p className="text-[13px] text-graphite">Nothing to preview yet.</p>
                <p className="mt-1 text-[12px] text-stone">Tap a preset above, or describe the change and press Preview.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Proposed (not applied)</p>
                {previewRows.map((row) => (
                  <div key={row.key} className="rounded-lg border border-line bg-bone px-3 py-2 text-[12px]">
                    <p className="font-medium text-ink">{row.title}</p>
                    <p className="mt-0.5 text-graphite"><span className="line-through">{row.before}</span> → <span className="text-ink">{row.after}</span></p>
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
              : `${preview.assignments.length + preview.targets.length + preview.schedules.length} proposed`}
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
