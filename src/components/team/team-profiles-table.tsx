'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from 'cn'
import { V4Chip, V4Empty, V4Panel, V4StatStrip } from '@/components/v4/primitives'
import type { TeamProfileDirectoryRow } from '@/lib/team/profiles'
import { AddProfileWizard } from './add-profile-wizard'

type View = 'all' | 'assigned' | 'unassigned' | 'attention'

interface RepOption {
  id: string
  name: string
  profiles: string[]
}

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

export function TeamProfilesTable(props: {
  profiles: TeamProfileDirectoryRow[]
  businessDate: string
  error?: boolean
  reps: RepOption[]
}) {
  return (
    <Suspense fallback={<TeamProfilesTableInner {...props} />}>
      <TeamProfilesTableInner {...props} />
    </Suspense>
  )
}

function TeamProfilesTableInner({
  profiles,
  businessDate,
  error = false,
  reps,
}: {
  profiles: TeamProfileDirectoryRow[]
  businessDate: string
  error?: boolean
  reps: RepOption[]
}) {
  const searchParams = useSearchParams()
  const [view, setView] = useState<View>(() =>
    searchParams.get('view') === 'unassigned' ? 'unassigned' : 'all',
  )
  const [repFilter, setRepFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [wizardOpen, setWizardOpen] = useState(() => searchParams.get('add') === '1')

  const assigned = profiles.filter((profile) => profile.assignmentCount > 0)
  const unassigned = profiles.filter((profile) => profile.assignmentCount === 0)
  const attention = profiles.filter((profile) => profile.status === 'at_risk' || profile.status === 'missed')
  const needsReview = profiles.filter((profile) => profile.needsReview)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return profiles.filter((profile) => {
      if (view === 'assigned' && profile.assignmentCount === 0) return false
      if (view === 'unassigned' && profile.assignmentCount > 0) return false
      if (view === 'attention' && !(profile.status === 'at_risk' || profile.status === 'missed')) return false
      if (repFilter && !profile.assignedRepIds.includes(repFilter)) return false
      if (channelFilter && !profile.channels.includes(channelFilter)) return false
      if (statusFilter && profile.status !== statusFilter) return false
      if (query && !profile.profileName.toLowerCase().includes(query)) return false
      return true
    })
  }, [profiles, view, repFilter, channelFilter, statusFilter, search])

  const channels = [...new Set(profiles.flatMap((profile) => profile.channels))].sort()
  const statuses = [
    ...new Set(
      profiles.map((profile) => profile.status).filter((status): status is string => Boolean(status)),
    ),
  ].sort()

  const stats: Array<{ key: string; label: string; value: number | string; hint: string; tone: 'neutral' | 'warning' | 'danger' | 'success' }> = [
    { key: 'active', label: 'Active', value: profiles.length, hint: 'Sending profiles', tone: 'neutral' },
    { key: 'assigned', label: 'Assigned', value: assigned.length, hint: 'With at least one rep', tone: 'neutral' },
    { key: 'unassigned', label: 'Unassigned', value: unassigned.length, hint: unassigned.length > 0 ? 'Needs a rep' : 'All assigned', tone: unassigned.length > 0 ? 'warning' : 'neutral' },
    { key: 'attention', label: 'Needs attention', value: attention.length, hint: 'At risk or missed', tone: attention.length > 0 ? 'danger' : 'neutral' },
    { key: 'review', label: 'Needs review', value: needsReview.length, hint: needsReview.length > 0 ? 'Missing owner, name or channel' : 'All profiles complete', tone: needsReview.length > 0 ? 'warning' : 'neutral' },
  ]

  const views: Array<{ key: View; label: string; count: number }> = [
    { key: 'all', label: 'All', count: profiles.length },
    { key: 'assigned', label: 'Assigned', count: assigned.length },
    { key: 'unassigned', label: 'Unassigned', count: unassigned.length },
    { key: 'attention', label: 'Needs attention', count: attention.length },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Team / Profiles</p>
          <h1 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">Profiles</h1>
          <p className="mt-1 text-[13px] text-graphite">
            Every sending profile, its channel, the rep it is assigned to and today&apos;s completion.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-stone">{businessDate}</span>
          <Link
            href="/team/coverage"
            className="rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-graphite transition-colors hover:text-ink"
          >
            Coverage
          </Link>
          <Link
            href="/team/coverage#readiness"
            className="rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-graphite transition-colors hover:text-ink"
          >
            Readiness
          </Link>
          <button
            type="button"
            onClick={() => setView('unassigned')}
            className="rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-graphite transition-colors hover:text-ink"
          >
            Assign profile
          </button>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="rounded-lg bg-solid px-3.5 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
          >
            Add profile
          </button>
        </div>
      </div>

      <V4StatStrip items={stats} label="Profiles summary" />

      {error && (
        <div role="alert" className="rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-[12px] text-graphite">
          Profile data is temporarily unavailable. Try again in a moment.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {views.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key)}
              className={cn(
                'rounded-full px-3 py-1.5 text-[12px] font-medium ring-1 transition-colors',
                view === item.key ? 'bg-solid text-on-solid ring-solid' : 'bg-bone text-graphite ring-line hover:text-ink',
              )}
            >
              {item.label}
              <span className="ml-1.5 tabular-nums opacity-70">{item.count}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search profiles"
            aria-label="Search profiles"
            className="h-9 w-40 rounded-lg border border-line bg-bone-raised px-3 text-[12px] text-ink"
          />
          <select value={repFilter} onChange={(event) => setRepFilter(event.target.value)} aria-label="Filter by rep" className="h-9 rounded-lg border border-line bg-bone-raised px-2 text-[12px] text-ink">
            <option value="">All reps</option>
            {reps.map((rep) => (
              <option key={rep.id} value={rep.id}>{rep.name}</option>
            ))}
          </select>
          <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} aria-label="Filter by channel" className="h-9 rounded-lg border border-line bg-bone-raised px-2 text-[12px] text-ink">
            <option value="">All channels</option>
            {channels.map((channel) => (
              <option key={channel} value={channel} className="capitalize">{channel}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status" className="h-9 rounded-lg border border-line bg-bone-raised px-2 text-[12px] text-ink">
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>{statusLabel(status)}</option>
            ))}
          </select>
        </div>
      </div>

      <V4Panel padded={false}>
        <div
          className="hidden overflow-x-auto md:block"
          tabIndex={0}
          role="region"
          aria-label="Profiles table"
        >
          <table className="w-full min-w-[920px] text-left">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-stone">
                <th className="px-4 py-2 font-medium">Profile</th>
                <th className="px-4 py-2 font-medium">Channel</th>
                <th className="px-4 py-2 font-medium">Primary</th>
                <th className="px-4 py-2 font-medium">Backups</th>
                <th className="px-4 py-2 font-medium">Today</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((profile) => (
                <tr key={profile.profileId} className="border-b border-line/60 align-top last:border-0">
                  <td className="px-4 py-3 text-[13px] font-medium text-ink">{profile.profileName}</td>
                  <td className="px-4 py-3 text-[12px] text-graphite">
                    {profile.channels.join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-[12px]">
                    {profile.primaryRepName ? (
                      <span className="text-ink">{profile.primaryRepName}</span>
                    ) : (
                      <Link
                        href={`/team/profiles/${profile.profileId}`}
                        className="text-status-warning hover:underline"
                      >
                        Assign primary
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-graphite">
                    {profile.backups.length > 0 ? profile.backups.join(', ') : <span className="text-stone">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <ProgressCell completed={profile.completedCount} target={profile.targetCount} />
                  </td>
                  <td className="px-4 py-3">
                    <V4Chip tone={STATUS_TONE[profile.status ?? ''] ?? 'neutral'}>{statusLabel(profile.status)}</V4Chip>
                    {profile.needsReview && (
                      <Link
                        href={`/team/profiles/${profile.profileId}`}
                        className="mt-1 block text-[11px] text-status-warning hover:underline"
                      >
                        Needs review
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/team/profiles/${profile.profileId}`}
                      className="inline-flex min-h-11 items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 p-3 md:hidden">
          {filtered.map((profile) => (
            <div key={profile.profileId} className="rounded-xl bg-bone-raised p-3 ring-1 ring-line">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">{profile.profileName}</p>
                  <p className="text-[11px] text-stone">
                    {profile.channels.join(' · ') || '—'} · {profile.primaryRepName ?? 'No primary'}
                    {profile.backups.length > 0 ? ` · Backups: ${profile.backups.join(', ')}` : ''}
                  </p>
                </div>
                <V4Chip tone={STATUS_TONE[profile.status ?? ''] ?? 'neutral'}>{statusLabel(profile.status)}</V4Chip>
              </div>
              <div className="mt-2.5">
                <ProgressCell completed={profile.completedCount} target={profile.targetCount} />
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="p-4">
            <V4Empty
              title={view === 'unassigned' ? 'No unassigned profiles' : 'No profiles match this view'}
              body={view === 'unassigned' ? 'Every sending profile has a rep.' : 'Adjust the filters or add a profile.'}
            />
          </div>
        )}
      </V4Panel>

      <RepInverse profiles={profiles} />

      {wizardOpen && (
        <AddProfileWizard reps={reps} onClose={() => setWizardOpen(false)} />
      )}
    </div>
  )
}

/** The inverse view: REP → PROFILES, with the rep's total completion. */
function RepInverse({ profiles }: { profiles: TeamProfileDirectoryRow[] }) {
  const byRep = new Map<string, { target: number; completed: number; rows: TeamProfileDirectoryRow[] }>()
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
        <h2 className="text-mono-medium text-[11px] uppercase tracking-[0.18em] text-stone">Reps</h2>
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
