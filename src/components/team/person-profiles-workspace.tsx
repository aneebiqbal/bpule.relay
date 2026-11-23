'use client'

/**
 * Team → Profiles: a card workspace, one card per PERSON.
 *
 * A person's distinct accounts (LinkedIn A/B, Upwork A/B) are children of the
 * card, each with its own account identity, chain, targets and actions. The
 * underlying identities are never merged or deduplicated; the person grouping
 * is presentation only. A table density option is kept for people who prefer it.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from 'cn'
import { V4Chip, V4Empty, V4StatStrip } from '@/components/v4/primitives'
import { ChannelLogo } from '@/components/ui/channel-logo'
import { ChannelBadge } from '@/components/ui/channel-badge'
import { ManagePeopleDialog } from '@/components/coverage/manage-people-dialog'
import { LifecycleDialog } from './lifecycle-dialog'
import { TeamProfilesTable } from './team-profiles-table'
import { AddProfileWizard } from './add-profile-wizard'
import type { TeamProfileDirectoryRow, TeamProfileChannelDetail } from '@/lib/team/profiles'

type Density = 'cards' | 'table'
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '·'
}

function Progress({ completed, target }: { completed: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] tabular-nums text-ink">{completed}<span className="text-stone"> / {target}</span></span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-bone ring-1 ring-line/70" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Today's completion">
        <div className="h-full rounded-full bg-orange" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function PersonProfilesWorkspace(props: {
  profiles: TeamProfileDirectoryRow[]
  businessDate: string
  error?: boolean
  reps: RepOption[]
  canManageIdentities: boolean
}) {
  return <WorkspaceInner {...props} />
}

function WorkspaceInner({
  profiles,
  businessDate,
  error = false,
  reps,
  canManageIdentities,
}: {
  profiles: TeamProfileDirectoryRow[]
  businessDate: string
  error?: boolean
  reps: RepOption[]
  canManageIdentities: boolean
}) {
  const searchParams = useSearchParams()
  const [density, setDensity] = useState<Density>('cards')
  const [view, setView] = useState<View>(() => (searchParams.get('view') === 'unassigned' ? 'unassigned' : 'all'))
  const [channel, setChannel] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [assign, setAssign] = useState<{ channel: TeamProfileChannelDetail; profileId: string } | null>(null)
  const [wizardOpen, setWizardOpen] = useState(() => searchParams.get('add') === '1')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return profiles.filter((profile) => {
      if (view === 'assigned' && profile.assignmentCount === 0) return false
      if (view === 'unassigned' && profile.assignmentCount > 0) return false
      if (view === 'attention' && !(profile.status === 'at_risk' || profile.status === 'missed')) return false
      if (channel && !profile.channels.includes(channel)) return false
      if (q) {
        const haystack = `${profile.profileName} ${profile.channels.join(' ')} ${profile.assignedReps.join(' ')}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [profiles, view, channel, search])

  const channels = useMemo(() => [...new Set(profiles.flatMap((profile) => profile.channels))].sort(), [profiles])

  const stats = [
    { key: 'people', label: 'People', value: profiles.length, hint: 'One card per person' },
    { key: 'assigned', label: 'Assigned', value: profiles.filter((p) => p.assignmentCount > 0).length, hint: 'With at least one operator' },
    { key: 'unassigned', label: 'Unassigned', value: profiles.filter((p) => p.assignmentCount === 0).length, hint: 'Needs an operator' },
    { key: 'acknowledgement', label: 'Acknowledgements', value: profiles.filter((p) => p.pendingAcknowledgementRepIds.length > 0).length, hint: 'Not confirmed' },
    { key: 'attention', label: 'Needs attention', value: profiles.filter((p) => p.status === 'at_risk' || p.status === 'missed').length, hint: 'At risk or missed' },
  ]

  function toggleExpand(key: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const views: Array<{ key: View; label: string; count: number }> = [
    { key: 'all', label: 'All', count: profiles.length },
    { key: 'assigned', label: 'Assigned', count: profiles.filter((p) => p.assignmentCount > 0).length },
    { key: 'unassigned', label: 'Unassigned', count: profiles.filter((p) => p.assignmentCount === 0).length },
    { key: 'attention', label: 'Needs attention', count: profiles.filter((p) => p.status === 'at_risk' || p.status === 'missed').length },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Team / Profiles</p>
          <h1 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">Profiles</h1>
          <p className="mt-1 text-[13px] text-graphite">
            One card per person. Each account keeps its own identity, operators and targets.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-stone">{businessDate}</span>
          <div className="flex rounded-lg border border-line bg-bone-raised p-0.5">
            {(['cards', 'table'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={density === option}
                onClick={() => setDensity(option)}
                className={cn('rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors', density === option ? 'bg-bone text-ink shadow-sm' : 'text-graphite hover:text-ink')}
              >
                {option === 'cards' ? 'Cards' : 'Table'}
              </button>
            ))}
          </div>
          {canManageIdentities && (
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="rounded-lg bg-solid px-3.5 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
            >
              Add account
            </button>
          )}
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
            placeholder="Search people, accounts or operators…"
            aria-label="Search people, accounts or operators"
            className="h-9 w-56 rounded-lg border border-line bg-bone-raised px-3 text-[12px] text-ink placeholder:text-stone"
          />
          <select
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            aria-label="Channel filter"
            className="h-9 rounded-lg border border-line bg-bone-raised px-2 text-[12px] text-ink"
          >
            <option value="">All channels</option>
            {channels.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
      </div>

      {density === 'table' ? (
        <TeamProfilesTable profiles={filtered} businessDate={businessDate} error={error} reps={reps} canManageIdentities={canManageIdentities} />
      ) : filtered.length === 0 ? (
        <V4Empty title="No people match this view" body="Adjust the filters or add an account." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((profile) => (
            <PersonCard
              key={profile.profileId}
              profile={profile}
              expanded={expanded.has(profile.profileId)}
              onToggle={() => toggleExpand(profile.profileId)}
              onAssign={(channel) => setAssign({ channel, profileId: profile.profileId })}
              canManageIdentities={canManageIdentities}
            />
          ))}
        </div>
      )}

      {assign && (
        <ManagePeopleDialog
          profileId={assign.profileId}
          identityName={assign.channel.identityName}
          channel={assign.channel.channel}
          primaryRepId={assign.channel.primaryRepId ?? null}
          operators={assign.channel.operators.map((name, index) => ({ repId: assign.channel.operatorRepIds[index] ?? '', repName: name, priority: index + 1 }))}
          backups={assign.channel.backups.map((name, index) => ({ repId: assign.channel.backupRepIds[index] ?? '', repName: name, priority: index + 1 }))}
          reps={reps}
          onClose={() => setAssign(null)}
        />
      )}

      {wizardOpen && (
        <AddProfileWizard
          reps={reps}
          existingPeople={profiles.map((profile) => ({ key: profile.profileId, name: profile.profileName }))}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </div>
  )
}

function PersonCard({
  profile,
  expanded,
  onToggle,
  onAssign,
  canManageIdentities,
}: {
  profile: TeamProfileDirectoryRow
  expanded: boolean
  onToggle: () => void
  onAssign: (channel: TeamProfileChannelDetail) => void
  canManageIdentities: boolean
}) {
  const [lifecycle, setLifecycle] = useState<{ identityId: string; identityName: string; channel: string; status: string } | null>(null)
  const issues: string[] = []
  if (!profile.primaryRepName) issues.push('No primary')
  if (profile.pendingAcknowledgementRepIds.length > 0) issues.push(`${profile.pendingAcknowledgementRepIds.length} unconfirmed`)
  if (profile.coverageState === 'AMBIGUOUS') issues.push('Ambiguous ownership')
  if (profile.needsReview) issues.push(profile.reviewReasons[0] ?? 'Needs review')

  return (
    <section className="rounded-2xl bg-bone p-1.5 ring-1 ring-line">
      <div className="rounded-xl bg-bone-raised p-4 ring-1 ring-line/70">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bone text-[13px] font-medium text-ink ring-1 ring-line">
              {initials(profile.profileName)}
            </span>
            <div className="min-w-0">
              <Link href={`/team/profiles/${profile.profileId}`} className="truncate text-[15px] font-medium text-ink hover:underline">
                {profile.profileName}
              </Link>
              <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-stone">
                {profile.channels.length > 0
                  ? profile.channels.map((channel) => <ChannelBadge key={channel} channel={channel} />)
                  : <span>No channel</span>}
                <span>·</span>
                <span>{profile.primaryRepName ? `Primary ${profile.primaryRepName}` : 'No primary'}</span>
              </p>
            </div>
          </div>
          <V4Chip tone={STATUS_TONE[profile.status ?? ''] ?? 'neutral'}>{profile.status ? profile.status.replaceAll('_', ' ') : '—'}</V4Chip>
        </div>

        {issues.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {issues.map((issue) => <V4Chip key={issue} tone="warning">{issue}</V4Chip>)}
          </div>
        )}

        <ul className="mt-3 space-y-1.5">
          {profile.channelDetails.map((channel) => (
            <li key={channel.identityId} className="rounded-lg border border-line/70">
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors hover:bg-bone"
              >
                  <span className="flex min-w-0 items-center gap-2">
                  <ChannelLogo channel={channel.channel} />
                  <span className="truncate text-[13px] font-medium text-ink">{channel.identityName}</span>
                  {channel.status !== 'active' && (
                    <span className="rounded-full border border-status-warning/40 bg-status-warning/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.1em] text-status-warning">
                      {channel.status}
                    </span>
                  )}
                  <span className="truncate text-[11px] text-stone">{channel.channel}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Progress completed={channel.completed} target={channel.target} />
                  <span className="text-[11px] text-stone" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
                </span>
              </button>
              {expanded && (
                <div className="border-t border-line/70 px-3 py-2.5">
                  <dl className="grid grid-cols-1 gap-1.5 text-[12px] sm:grid-cols-2">
                    <div>
                      <dt className="text-stone">Primary</dt>
                      <dd className="text-ink">{channel.primaryRepName ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-stone">Operators</dt>
                      <dd className="text-ink">{channel.operators.length > 0 ? channel.operators.join(', ') : '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-stone">Backups</dt>
                      <dd className="text-ink">{channel.backups.length > 0 ? channel.backups.join(', ') : '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-stone">Contributors</dt>
                      <dd className="text-ink">{channel.contributors.length > 0 ? channel.contributors.map((row) => `${row.repName} ${row.completedCount}`).join(', ') : '—'}</dd>
                    </div>
                  </dl>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {canManageIdentities && (
                      <button
                        type="button"
                        onClick={() => onAssign(channel)}
                        className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-graphite transition-colors hover:text-ink"
                      >
                        Assign operators
                      </button>
                    )}
                    {canManageIdentities && (
                      <button
                        type="button"
                        onClick={() =>
                          setLifecycle({
                            identityId: channel.identityId,
                            identityName: channel.identityName,
                            channel: channel.channel,
                            status: channel.status,
                          })
                        }
                        className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-graphite transition-colors hover:text-ink"
                      >
                        Status
                      </button>
                    )}
                    <Link href={`/team/profiles/${profile.profileId}?tab=execution`} className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-graphite transition-colors hover:text-ink">
                      Configure target
                    </Link>
                    <Link href={`/team/profiles/${profile.profileId}?tab=schedule`} className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-graphite transition-colors hover:text-ink">
                      Schedule
                    </Link>
                    <Link href={`/team/profiles/${profile.profileId}?tab=knowledge`} className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-graphite transition-colors hover:text-ink">
                      Knowledge
                    </Link>
                    <Link href={`/team/profiles/${profile.profileId}?tab=history`} className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-graphite transition-colors hover:text-ink">
                      History
                    </Link>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Link href={`/team/profiles/${profile.profileId}`} className="text-[12px] font-medium text-ink hover:underline">
            Open workspace →
          </Link>
          <button
            type="button"
            onClick={onToggle}
            className="text-[11px] text-stone hover:text-ink"
            aria-expanded={expanded}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {lifecycle && (
        <LifecycleDialog
          identityId={lifecycle.identityId}
          identityName={lifecycle.identityName}
          channel={lifecycle.channel}
          status={lifecycle.status}
          onClose={() => setLifecycle(null)}
        />
      )}
    </section>
  )
}
