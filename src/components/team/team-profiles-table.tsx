import type { TeamProfileRow } from '@/lib/team/profiles'
import { V4Chip, V4Empty, V4PageHeader, V4Panel, V4StatStrip } from '@/components/v4/primitives'

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

function ProgressCell({ completed, target }: { completed: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] tabular-nums text-ink">
        {completed} / {target}
      </span>
      <div
        className="h-1 w-14 overflow-hidden rounded-full bg-bone ring-1 ring-line/70"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Completion"
      >
        <div className="h-full rounded-full bg-orange" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function TeamProfilesTable({
  profiles,
  businessDate,
  error = false,
}: {
  profiles: TeamProfileRow[]
  businessDate: string
  error?: boolean
}) {
  const totalTarget = profiles.reduce((sum, p) => sum + p.targetCount, 0)
  const totalCompleted = profiles.reduce((sum, p) => sum + p.completedCount, 0)
  const behind = profiles.filter((p) => p.status === 'at_risk' || p.status === 'missed').length

  const stats: Array<{ key: string; label: string; value: number | string; hint: string; tone: 'neutral' | 'warning' | 'danger' | 'success' }> = [
    { key: 'profiles', label: 'Profiles', value: profiles.length, hint: 'Assigned today', tone: 'neutral' },
    { key: 'completed', label: 'Completed', value: totalCompleted, hint: `of ${totalTarget} target`, tone: totalTarget > 0 && totalCompleted >= totalTarget ? 'success' : 'neutral' },
    { key: 'remaining', label: 'Remaining', value: Math.max(0, totalTarget - totalCompleted), hint: 'Across all profiles', tone: 'neutral' },
    { key: 'behind', label: 'Behind', value: behind, hint: behind > 0 ? 'At risk or missed' : 'All on track', tone: behind > 0 ? 'warning' : 'neutral' },
  ]

  return (
    <div className="space-y-6">
      <V4PageHeader
        eyebrow="Team / Profiles"
        title="Profiles"
        subtitle="Every sending profile, its channel, the rep it is assigned to and today's completion."
        meta={<span className="text-[12px] text-graphite">{businessDate}</span>}
      />

      <V4StatStrip items={stats} label="Profiles summary" />

      {error && (
        <div role="alert" className="rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-[12px] text-graphite">
          Profile data is temporarily unavailable. Try again in a moment.
        </div>
      )}

      <V4Panel padded={false}>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[920px] text-left">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-stone">
                <th className="px-4 py-2 font-medium">Profile</th>
                <th className="px-4 py-2 font-medium">Channel</th>
                <th className="px-4 py-2 font-medium">Assigned rep</th>
                <th className="px-4 py-2 font-medium">Today</th>
                <th className="px-4 py-2 font-medium">Replies</th>
                <th className="px-4 py-2 font-medium">Follow-ups</th>
                <th className="px-4 py-2 font-medium">Proposals</th>
                <th className="px-4 py-2 font-medium">Meetings</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.profileId} className="border-b border-line/60 align-top last:border-0">
                  <td className="px-4 py-3 text-[13px] font-medium text-ink">{profile.profileName}</td>
                  <td className="px-4 py-3 text-[12px] text-graphite">
                    {profile.channels.join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-graphite">
                    {profile.assignedReps.join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ProgressCell completed={profile.completedCount} target={profile.targetCount} />
                  </td>
                  <td className="px-4 py-3 text-[12px] text-stone">—</td>
                  <td className="px-4 py-3 text-[12px] tabular-nums text-graphite">
                    {profile.followUps || '—'}
                  </td>
                  <td className="px-4 py-3 text-[12px] tabular-nums text-graphite">
                    {profile.proposals || '—'}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-stone">—</td>
                  <td className="px-4 py-3">
                    <V4Chip tone={STATUS_TONE[profile.status ?? ''] ?? 'neutral'}>
                      {statusLabel(profile.status)}
                    </V4Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 p-3 md:hidden">
          {profiles.map((profile) => (
            <div key={profile.profileId} className="rounded-xl bg-bone-raised p-3 ring-1 ring-line">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">{profile.profileName}</p>
                  <p className="text-[11px] text-stone">
                    {profile.channels.join(' · ') || '—'} · {profile.assignedReps.join(', ') || 'Unassigned'}
                  </p>
                </div>
                <V4Chip tone={STATUS_TONE[profile.status ?? ''] ?? 'neutral'}>
                  {statusLabel(profile.status)}
                </V4Chip>
              </div>
              <div className="mt-2.5">
                <ProgressCell completed={profile.completedCount} target={profile.targetCount} />
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <dt className="text-stone">Follow-ups</dt>
                  <dd className="tabular-nums text-ink">{profile.followUps || '—'}</dd>
                </div>
                <div>
                  <dt className="text-stone">Proposals</dt>
                  <dd className="tabular-nums text-ink">{profile.proposals || '—'}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        {profiles.length === 0 && (
          <div className="p-4">
            <V4Empty
              title="No profiles assigned"
              body="When an admin assigns a sending identity to a rep, the profile appears here."
            />
          </div>
        )}
      </V4Panel>

      <RepInverse profiles={profiles} />
    </div>
  )
}

/** The inverse view: REP → PROFILES, with the rep's total completion. */
function RepInverse({ profiles }: { profiles: TeamProfileRow[] }) {
  const byRep = new Map<string, { target: number; completed: number; rows: TeamProfileRow[] }>()
  for (const profile of profiles) {
    const reps = profile.assignedReps.length > 0 ? profile.assignedReps : ['Unassigned']
    for (const rep of reps) {
      const entry = byRep.get(rep) ?? { target: 0, completed: 0, rows: [] }
      entry.target += profile.targetCount
      entry.completed += profile.completedCount
      entry.rows.push(profile)
      byRep.set(rep, entry)
    }
  }

  const reps = [...byRep.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  if (reps.length === 0) return null

  return (
    <V4Panel>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-mono-medium text-[11px] uppercase tracking-[0.18em] text-stone">
          Reps
        </h2>
        <span className="text-[12px] text-stone">REP → profiles</span>
      </div>
      <ul className="space-y-3">
        {reps.map(([rep, entry]) => {
          const pct = entry.target > 0 ? Math.min(100, Math.round((entry.completed / entry.target) * 100)) : 0
          return (
            <li key={rep}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px] font-medium text-ink">{rep}</p>
                <p className="text-[12px] tabular-nums text-graphite">
                  <span className="font-medium text-ink">{entry.completed}</span> / {entry.target}
                  {entry.target > 0 && <span className="ml-1.5 text-stone">{pct}%</span>}
                </p>
              </div>
              <div
                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bone ring-1 ring-line/70"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${rep} completion`}
              >
                <div
                  className="h-full rounded-full bg-orange transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <ul className="mt-2 space-y-1">
                {entry.rows.map((row) => (
                  <li key={row.profileId} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="min-w-0 truncate text-graphite">
                      {row.profileName}
                      <span className="text-stone"> · {row.channels.join(' · ') || 'No channel'}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-ink">
                      {row.completedCount} / {row.targetCount}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </V4Panel>
  )
}
