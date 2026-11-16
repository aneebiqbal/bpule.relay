'use client'

/**
 * Team Command Center — the default /team experience.
 *
 * One compact operating picture: what needs action, who works what, and which
 * channel plans are behind. Every figure is derived server-side by
 * `loadTeamCommandCenter`; this component filters and renders, it never
 * recomputes. Detail pages are drilldowns, not the primary navigation.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { cn } from 'cn'
import { V4Panel, V4PanelHeader, V4StatStrip, V4Chip, V4Empty, V4PageHeader } from '@/components/v4/primitives'
import { TimelineTable, InlineError } from '@/components/operations/ops-primitives'
import type { CommandCenterData, CommandMatrixRow } from '@/lib/team/command-center'
import { AssignmentDrawer } from './assignment-drawer'
import { SetupAssistant } from './setup-assistant'

const CHANNEL_OPTIONS = ['linkedin', 'upwork', 'email', 'other']

export function TeamCommandCenter({
  data,
  reps,
  profiles,
  identities,
  canManage,
}: {
  data: CommandCenterData
  reps: Array<{ id: string; name: string }>
  profiles: Array<{ id: string; name: string }>
  identities: Array<{ id: string; profileId: string; channel: string; name: string }>
  canManage: boolean
}) {
  const [query, setQuery] = useState('')
  const [channel, setChannel] = useState('')
  const [role, setRole] = useState('')
  const [assignOpen, setAssignOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [respView, setRespView] = useState<'operators' | 'profiles'>('operators')

  const matrix = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.matrix
      .map((row) => ({
        ...row,
        assignments: row.assignments.filter((assignment) => {
          if (channel && !assignment.channels.includes(channel)) return false
          if (role && assignment.role !== role) return false
          if (q && !`${row.repName} ${assignment.profileName}`.toLowerCase().includes(q)) return false
          return true
        }),
      }))
      .filter((row) => row.assignments.length > 0)
      .sort((a, b) => b.assignments.length - a.assignments.length || a.repName.localeCompare(b.repName))
  }, [data.matrix, query, channel, role])

  const targets = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.targets.filter((row) => {
      if (channel && row.channel !== channel) return false
      if (q && !`${row.profileName} ${row.identityName}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [data.targets, query, channel])

  const summary = data.summary

  return (
    <div className="space-y-5">
      <V4PageHeader
        eyebrow={`Team · ${data.businessDate}`}
        title="Command Center"
        subtitle={
          data.isWorkingDay
            ? `${data.timezone} · ${summary.people} people · ${summary.coverage.COVERED} of ${data.coverage.totalProfiles} profiles covered`
            : `Not a working day · ${data.timezone}`
        }
        actions={
          canManage ? (
            <>
              <button
                type="button"
                onClick={() => setAssignOpen(true)}
                className="rounded-lg border border-line bg-bone px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone-raised"
              >
                Assign people
              </button>
              <button
                type="button"
                onClick={() => setSetupOpen(true)}
                className="rounded-lg bg-solid px-3 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98]"
              >
                Setup assistant
              </button>
            </>
          ) : undefined
        }
      />

      <V4StatStrip
        label="Team operating summary"
        items={[
          { key: 'working', label: 'Working', value: summary.working, hint: `${summary.behind} behind` },
          { key: 'unassigned', label: 'Unassigned profiles', value: summary.unassignedProfiles, tone: summary.unassignedProfiles ? 'warning' : 'neutral', href: '/team/profiles?view=unassigned' },
          { key: 'acknowledgement', label: 'Needs acknowledgement', value: summary.unacknowledged, tone: summary.unacknowledged ? 'warning' : 'neutral' },
          { key: 'replies', label: 'Replies waiting', value: summary.repliesWaiting, tone: summary.repliesWaiting ? 'warning' : 'neutral', href: '/chats?view=waiting_me' },
          { key: 'overdue', label: 'Overdue tasks', value: summary.overdueTasks, tone: summary.overdueTasks ? 'danger' : 'neutral', href: '/tasks?view=overdue&scope=team' },
          { key: 'target', label: 'Target today', value: `${summary.completed} / ${summary.target}`, hint: `${summary.remaining} remaining` },
          { key: 'coverage', label: 'Coverage at risk', value: summary.coverage.AT_RISK + summary.coverage.UNCOVERED, tone: summary.coverage.AT_RISK + summary.coverage.UNCOVERED ? 'danger' : 'neutral' },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people or profiles…"
          aria-label="Search people or profiles"
          className="h-9 min-w-52 flex-1 rounded-lg border border-line bg-bone px-3 text-[13px] text-ink placeholder:text-stone sm:flex-none"
        />
        <select
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
          aria-label="Channel filter"
          className="h-9 rounded-lg border border-line bg-bone px-2 text-[13px] text-ink"
        >
          <option value="">All channels</option>
          {CHANNEL_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select
          value={role}
          onChange={(event) => setRole(event.target.value)}
          aria-label="Role filter"
          className="h-9 rounded-lg border border-line bg-bone px-2 text-[13px] text-ink"
        >
          <option value="">All roles</option>
          <option value="PRIMARY">Primary</option>
          <option value="OPERATOR">Operator</option>
          <option value="BACKUP">Backup</option>
        </select>
      </div>

      <V4Panel>
        <V4PanelHeader
          eyebrow="Next"
          title="Action queue"
          hint="Ranked by urgency — coverage first, then assignments, acknowledgements, targets and overdue work."
          action={<span className="text-[12px] text-stone">{data.actions.length} open</span>}
        />
        <div className="mt-3">
          {data.actions.length === 0 ? (
            <V4Empty title="Nothing needs you" body="Coverage, assignments and targets are all current." />
          ) : (
            <ul className="divide-y divide-line/70">
              {data.actions.map((action) => (
                <li key={action.id}>
                  <Link href={action.href} className="flex items-center justify-between gap-3 py-2.5 text-[13px] transition-colors hover:bg-bone">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-ink">{action.title}</span>
                      <span className="truncate text-graphite">· {action.detail}</span>
                    </span>
                    <V4Chip tone={action.severity === 'critical' ? 'danger' : 'warning'}>
                      {action.severity === 'critical' ? 'Critical' : 'Attention'}
                    </V4Chip>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </V4Panel>

      <V4Panel>
        <V4PanelHeader
          eyebrow="Operating"
          title="Responsibilities"
          hint="Executing operators first; backups are eligibility, never workload."
          action={
            <div className="flex rounded-lg border border-line bg-bone-raised p-0.5">
              {(['operators', 'profiles'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={respView === option}
                  onClick={() => setRespView(option)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                    respView === option ? 'bg-bone text-ink shadow-sm' : 'text-graphite hover:text-ink',
                  )}
                >
                  {option === 'operators' ? 'By operator' : 'By profile'}
                </button>
              ))}
            </div>
          }
        />
        <div className="mt-3">
          {matrix.length === 0 ? (
            <V4Empty title="No assignments in view" body="Adjust the filters or assign people to a profile." />
          ) : respView === 'operators' ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {matrix.map((row) => (
                <div key={row.repId} className="rounded-xl border border-line/70 bg-bone p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-medium text-ink">{row.repName}</p>
                    <span className="text-[11px] text-stone">{row.roleLabel}</span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {row.assignments.map((assignment) => (
                      <li key={`${assignment.profileId}:${assignment.role}`} className="flex items-center justify-between gap-2 rounded-lg bg-bone-raised px-2.5 py-1.5 ring-1 ring-line/70">
                        <span className="min-w-0">
                          <Link href={`/team/profiles/${assignment.profileId}`} className="truncate text-[12px] font-medium text-ink hover:underline">
                            {assignment.profileName}
                          </Link>
                          <span className="block truncate text-[10px] text-stone">{assignment.channels.join(' · ') || '—'}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <V4Chip tone={assignment.role === 'PRIMARY' ? 'info' : assignment.role === 'OPERATOR' ? 'neutral' : 'neutral'}>
                            {assignment.role === 'PRIMARY' ? 'Primary' : assignment.role === 'OPERATOR' ? 'Operator' : 'Backup'}
                          </V4Chip>
                          <span className="text-[11px] tabular-nums text-graphite">
                            {assignment.contribution}
                            {assignment.allocation ? <span className="text-stone"> / {assignment.allocation}</span> : null}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="contain-layout overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-stone">
                    <th className="py-2 pr-3 font-medium">Person</th>
                    <th className="py-2 pr-3 font-medium">Profile</th>
                    <th className="py-2 pr-3 font-medium">Channels</th>
                    <th className="py-2 pr-3 font-medium">Role</th>
                    <th className="py-2 pr-3 text-right font-medium">Today</th>
                    <th className="py-2 text-right font-medium">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row) => <MatrixRow key={row.repId} row={row} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </V4Panel>

      <V4Panel>
        <V4PanelHeader
          eyebrow="Targets"
          title="Target progress"
          hint="One requirement per channel lane, counted once. Contributions are named per operator."
        />
        <div className="mt-3">
          {targets.length === 0 ? (
            <V4Empty title="No channel plans in view" body="Set targets from a profile, or adjust the filters." />
          ) : (
            <ul className="divide-y divide-line/70">
              {targets.map((row) => (
                <li key={row.identityId}>
                  <Link
                    href={`/team/profiles/${row.profileId ?? ''}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[13px] transition-colors hover:bg-bone"
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-ink">{row.profileName}</span>
                      <span className="text-graphite"> · {row.identityName} · {row.channel}</span>
                      {row.allocated ? <V4Chip tone="info">Allocated</V4Chip> : row.shared ? <V4Chip>Shared</V4Chip> : null}
                    </span>
                    <span className="flex items-center gap-3 text-[12px] tabular-nums">
                      <span className="text-stone">{row.completed} done</span>
                      <span className="text-ink">{row.remaining} left</span>
                      <span className="text-stone">/ {row.target}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </V4Panel>

      <V4Panel>
        <V4PanelHeader eyebrow="Coverage" title="Coverage exceptions" hint="Only profiles that need a decision." />
        <div className="mt-3">
          {data.coverage.requiresApproval.length === 0 && data.coverage.profiles.every((profile) => profile.status === 'COVERED') ? (
            <V4Empty title="Coverage healthy" body="Every profile has an available operator." />
          ) : (
            <ul className="divide-y divide-line/70">
              {data.coverage.profiles
                .filter((profile) => profile.status !== 'COVERED')
                .map((profile) => (
                  <li key={profile.profileId}>
                    <Link href={`/team/profiles/${profile.profileId}`} className="flex items-center justify-between gap-3 py-2.5 text-[13px] transition-colors hover:bg-bone">
                      <span className="min-w-0">
                        <span className="font-medium text-ink">{profile.name}</span>
                        <span className="text-graphite"> · {profile.status === 'UNCOVERED' ? 'uncovered' : profile.status === 'AT_RISK' ? 'at risk' : 'backup active'}</span>
                      </span>
                      <V4Chip tone={profile.status === 'UNCOVERED' ? 'danger' : 'warning'}>
                        {profile.status === 'UNCOVERED' ? 'Critical' : 'Attention'}
                      </V4Chip>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </V4Panel>

      <V4Panel>
        <V4PanelHeader eyebrow="Activity" title="Recent changes" hint="Operational events across the team today." />
        <div className="mt-3">
          {data.timeline === null ? (
            <InlineError>Activity could not be loaded. Refresh to try again.</InlineError>
          ) : (
            <TimelineTable rows={data.timeline} now={Date.parse(`${data.businessDate}T12:00:00Z`)} empty="No operational activity today." />
          )}
        </div>
      </V4Panel>

      {canManage && (
        <>
          <AssignmentDrawer
            open={assignOpen}
            onClose={() => setAssignOpen(false)}
            profiles={profiles}
            reps={reps}
          />
          <SetupAssistant
            open={setupOpen}
            onClose={() => setSetupOpen(false)}
            profiles={profiles}
            reps={reps}
            identities={identities}
          />
        </>
      )}
    </div>
  )
}

function MatrixRow({ row }: { row: CommandMatrixRow }) {
  return (
    <>
      {row.assignments.map((assignment, index) => (
        <tr key={`${assignment.profileId}:${assignment.role}`} className="border-b border-line/60 align-top last:border-0">
          <td className="py-2.5 pr-3">
            {index === 0 ? (
              <>
                <p className="text-[13px] font-medium text-ink">{row.repName}</p>
                <p className="mt-0.5 text-[11px] text-stone">{row.roleLabel}</p>
              </>
            ) : null}
          </td>
          <td className="py-2.5 pr-3">
            <Link href={`/team/profiles/${assignment.profileId}`} className="text-[13px] font-medium text-ink hover:underline">
              {assignment.profileName}
            </Link>
          </td>
          <td className="py-2.5 pr-3 text-[12px] text-graphite">{assignment.channels.join(' · ') || '—'}</td>
          <td className="py-2.5 pr-3">
            <V4Chip tone={assignment.role === 'PRIMARY' ? 'info' : assignment.role === 'OPERATOR' ? 'neutral' : 'neutral'}>
              {assignment.role === 'PRIMARY' ? 'Primary' : assignment.role === 'OPERATOR' ? 'Operator' : 'Backup'}
            </V4Chip>
          </td>
          <td className="py-2.5 pr-3 text-right text-[12px] tabular-nums text-ink">
            {assignment.contribution}
            {assignment.allocation ? <span className="text-stone"> / {assignment.allocation}</span> : null}
          </td>
          <td className="py-2.5 text-right text-[12px] tabular-nums text-graphite">
            {assignment.target > 0 ? `${assignment.completed} / ${assignment.target}` : '—'}
          </td>
        </tr>
      ))}
    </>
  )
}
