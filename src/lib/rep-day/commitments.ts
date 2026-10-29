/**
 * Commitments — the seven rows Today shows, derived from real data.
 *
 * The canonical keys are stable product vocabulary. Their targets are not
 * hardcoded: they come from `daily_targets` (per rep × identity × activity),
 * with the organization's policy pack as the seed when a rep has no configured
 * target for that key. Nothing here knows what "25 profiles" means.
 *
 * `measured` is the honesty flag. A key with no target and no completions is
 * shown but excluded from the pace denominator — a rep must not be marked
 * behind on a metric the system does not yet measure.
 */
import type { TargetPackEntry } from '@/lib/org-clock'

export interface CommitmentTargetInput {
  activityType: string
  targetCount: number
  completedCount: number
}

export interface CommitmentRow {
  key: string
  label: string
  target: number
  completed: number
  remaining: number
  unit: 'count' | 'percent'
  /** Included in the pace denominator. */
  measured: boolean
  /** Target came from the policy pack, not a configured per-identity target. */
  seeded: boolean
  sources: string[]
}

export interface CommitmentSummary {
  rows: CommitmentRow[]
  totalTarget: number
  totalCompleted: number
  totalRemaining: number
  /** 0..1 across measured count rows. 1 when nothing is required. */
  progress: number
  /** Count of required actions outstanding, including mandatory replies. */
  requiredRemaining: number
  /** Outstanding buyer replies — mandatory regardless of target. */
  mandatoryRemaining: number
}

interface CommitmentDef {
  key: string
  label: string
  sources: string[]
  unit: 'count' | 'percent'
}

/**
 * One row per commitment. `sources` are the `daily_accountability.activity_type`
 * values that feed it. Keep this list small: it is the contract between the
 * event ledger and the Today screen.
 */
export const COMMITMENT_DEFS: CommitmentDef[] = [
  { key: 'profiles_supplied', label: 'Profiles', sources: ['prospect_extracted'], unit: 'count' },
  { key: 'emails_supplied', label: 'Emails', sources: ['email'], unit: 'count' },
  { key: 'jobs_reviewed', label: 'Jobs', sources: ['application'], unit: 'count' },
  { key: 'qualified_opportunities', label: 'Qualified', sources: ['proposal'], unit: 'count' },
  { key: 'outbound_actions', label: 'Outbound', sources: ['dm', 'connection_request'], unit: 'count' },
  { key: 'followups_completed', label: 'Follow-ups', sources: ['followup'], unit: 'count' },
  { key: 'replies_handled', label: 'Replies', sources: [], unit: 'percent' },
]

function packTarget(pack: TargetPackEntry[], key: string): TargetPackEntry | undefined {
  return pack.find((entry) => entry.key === key)
}

export function buildCommitments(input: {
  targets: CommitmentTargetInput[]
  repliesWaiting: number
  targetPack: TargetPackEntry[]
}): CommitmentSummary {
  const rows: CommitmentRow[] = []

  for (const def of COMMITMENT_DEFS) {
    if (def.unit === 'percent') {
      const pack = packTarget(input.targetPack, def.key)
      const target = pack?.target ?? 100
      const waiting = Math.max(0, input.repliesWaiting)
      const completed = waiting === 0 ? 100 : 0
      rows.push({
        key: def.key,
        label: def.label,
        target,
        completed,
        remaining: Math.max(0, target - completed),
        unit: 'percent',
        measured: true,
        seeded: !pack,
        sources: def.sources,
      })
      continue
    }

    let target = 0
    let completed = 0
    for (const row of input.targets) {
      if (!def.sources.includes(row.activityType)) continue
      target += Math.max(0, row.targetCount)
      completed += Math.max(0, row.completedCount)
    }

    const pack = packTarget(input.targetPack, def.key)
    const seeded = target === 0 && pack !== undefined
    if (seeded) target = Math.max(0, pack!.target)

    rows.push({
      key: def.key,
      label: def.label,
      target,
      completed,
      remaining: Math.max(0, target - completed),
      unit: 'count',
      measured: target > 0 || completed > 0,
      seeded,
      sources: def.sources,
    })
  }

  const measured = rows.filter((row) => row.unit === 'count' && row.measured)
  const totalTarget = measured.reduce((sum, row) => sum + row.target, 0)
  const totalCompleted = measured.reduce((sum, row) => sum + Math.min(row.completed, row.target), 0)
  const totalRemaining = Math.max(0, totalTarget - totalCompleted)
  const mandatoryRemaining = Math.max(0, input.repliesWaiting)

  return {
    rows,
    totalTarget,
    totalCompleted,
    totalRemaining,
    progress: totalTarget > 0 ? totalCompleted / totalTarget : 1,
    requiredRemaining: totalRemaining + mandatoryRemaining,
    mandatoryRemaining,
  }
}
