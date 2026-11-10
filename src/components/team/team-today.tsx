import Link from 'next/link'
import { assignableReps, getPeopleDirectory, requireTeamContext } from '@/lib/operations/page-context'
import { loadTeamDay } from '@/lib/rep-day/team'
import { availabilityLabel, loadCoverageFacts, loadCoveragePlan } from '@/lib/coverage/load'
import type { AvailabilityState, CoveragePlan, CoverageProfileResult } from '@/lib/coverage/engine'
import type { PeopleRow } from '@/lib/operations/people'
import { buildTeamAttentionFromPeople } from '@/lib/team/attention-policy'
import { loadTimeline } from '@/lib/operations/activity'
import { effectiveRepIds } from '@/lib/operations/scope'
import { rangeWindow } from '@/lib/operations/filters'
import { AssignTaskButton } from '@/components/operations/assign-task-button'
import { V4Chip, V4Empty, V4Panel, V4PanelHeader, V4StatStrip } from '@/components/v4/primitives'
import { InlineError, RepStatusBadge, TimelineTable } from '@/components/operations/ops-primitives'
import { ChannelBadge } from '@/components/ui/channel-badge'
import { ResponsibilityStatus } from '@/components/ui/responsibility-status'
import { buildWhoWorksWhat } from '@/lib/team/who-works-what'

/**
 * Team → Today — the one operating page for managers and admins.
 *
 * It answers four questions without page hopping: who needs attention, who is
 * working on what, which profile is uncovered, and what is overdue. Every number
 * comes from the canonical contracts (Team Day, People directory, Coverage plan,
 * Inbox) — this page computes nothing of its own.
 */
export async function TeamToday() {
  const ctx = await requireTeamContext()

  const [directory, team, facts, reps] = await Promise.all([
    getPeopleDirectory(),
    loadTeamDay(),
    loadCoverageFacts(ctx.auth.orgId, { client: ctx.client }),
    assignableReps(ctx),
  ])
  const plan = await loadCoveragePlan(ctx.auth.orgId, { client: ctx.client }, facts)

  const todayWindow = rangeWindow('today')
  const timeline = await loadTimeline(ctx.client, {
    orgId: ctx.auth.orgId,
    repIds: effectiveRepIds(ctx.scope, {}),
    start: todayWindow.start,
    end: todayWindow.end,
    limit: 20,
  }).catch(() => null)

  const attention = buildTeamAttentionFromPeople(directory.rows)
  const availabilityByRep = new Map(facts.availability.map((row) => [row.repId, row.state]))
  const onLeave = directory.rows.filter((row) => availabilityByRep.get(row.repId) === 'ON_LEAVE').length
  const working = team.counts.ACTIVE + team.counts.READY_TO_CLOSE
  const behind = team.counts.AT_RISK + team.counts.CRITICAL
  const overdueTotal = directory.rows.reduce((sum, row) => sum + row.overdueTasks, 0)
  // Behind and critical people first — the operating question is "who needs me".
  const STATUS_RANK: Record<string, number> = { Critical: 0, Attention: 1, 'On track': 2 }
  const people = [...directory.rows].sort(
    (a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) || a.repName.localeCompare(b.repName),
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Team · {team.businessDate}</p>
          <h1 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">Today</h1>
          <p className="mt-1 text-[13px] text-graphite">
            {team.isWorkingDay
              ? `${team.workdayStart}–${team.workdayEnd} ${team.timezone} · ${directory.rows.length} ${directory.rows.length === 1 ? 'person' : 'people'}`
              : `Not a working day · ${team.timezone}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AssignTaskButton reps={reps} />
          {ctx.scope.mode === 'org' && (
            <Link
              href="/admin/people"
              className="inline-flex h-9 items-center rounded-lg border border-line bg-bone px-3 text-[13px] font-medium text-ink transition-colors hover:bg-bone-raised"
            >
              Invite person
            </Link>
          )}
        </div>
      </div>

      <V4StatStrip
        label="Team status"
        items={[
          { key: 'working', label: 'Working', value: working, hint: 'On pace or ready to close' },
          { key: 'not-started', label: 'Not started', value: team.counts.NOT_STARTED, hint: 'No check-in yet', tone: team.counts.NOT_STARTED > 0 ? 'warning' : 'neutral' },
          { key: 'behind', label: 'Behind', value: behind, hint: 'At risk or critical', tone: behind > 0 ? 'danger' : 'neutral' },
          { key: 'leave', label: 'On leave', value: onLeave, hint: 'Unavailable today' },
          {
            key: 'replies',
            label: 'Replies waiting',
            value: team.totals.repliesWaiting,
            hint: 'Buyers waiting',
            href: '/chats?view=all',
            tone: team.totals.repliesWaiting > 0 ? 'warning' : 'neutral',
          },
          {
            key: 'overdue',
            label: 'Overdue tasks',
            value: overdueTotal,
            hint: 'Assigned work past due',
            href: '/tasks?view=overdue&scope=team',
            tone: overdueTotal > 0 ? 'danger' : 'neutral',
          },
        ]}
      />

      <V4Panel>
        <V4PanelHeader
          eyebrow="Needs attention"
          title="What needs your intervention"
          hint="Oldest and largest gaps across the team, most urgent first."
        />
        <div className="mt-3">
          {attention.length === 0 ? (
            <V4Empty title="Nothing needs attention" body="The team is on track right now." />
          ) : (
            <ul className="divide-y divide-line/70">
              {attention.slice(0, 8).map((signal) => (
                <li key={`${signal.repId}-${signal.category}`}>
                  <Link
                    href={signal.href}
                    className="flex items-center justify-between gap-3 py-2.5 text-[13px] transition-colors hover:bg-bone"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-ink">{signal.repName}</span>
                      <span className="truncate text-graphite">· {signal.reason}</span>
                    </span>
                    <V4Chip tone={signal.severity === 'critical' ? 'danger' : 'warning'}>
                      {signal.severity === 'critical' ? 'Critical' : 'Attention'}
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
          eyebrow="People"
          title="Who is working today"
          hint="Today's completion, replies waiting and overdue work."
        />
        <div className="mt-3">
          {people.length === 0 ? (
            <V4Empty title="No one in scope" body="Invite people to start operating the team." />
          ) : (
            <>
              <div
                className="hidden contain-layout overflow-x-auto md:block"
                tabIndex={0}
                role="region"
                aria-label="People today table"
              >
                <table className="w-full min-w-[820px] text-left">
                  <thead>
                    <tr className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-stone">
                      <th className="py-2 pr-3 font-medium">Person</th>
                      <th className="py-2 pr-3 font-medium">Today</th>
                      <th className="py-2 pr-3 font-medium">Replies</th>
                      <th className="py-2 pr-3 font-medium">Overdue</th>
                      <th className="py-2 pr-3 font-medium">Profiles</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((row) => (
                      <PeopleRow
                        key={row.repId}
                        row={row}
                        availability={availabilityByRep.get(row.repId) ?? null}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2 md:hidden">
                {people.map((row) => (
                  <PeopleCard
                    key={row.repId}
                    row={row}
                    availability={availabilityByRep.get(row.repId) ?? null}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </V4Panel>

      <WhoWorksWhat plan={plan} />

      <CoverageExceptions plan={plan} />

      <V4Panel>
        <V4PanelHeader
          eyebrow="Assigned work"
          title="Overdue assigned tasks"
          hint="Open work a manager assigned that is past due."
          action={
            <Link href="/tasks?view=overdue&scope=team" className="text-[12px] text-graphite hover:text-ink">
              All overdue →
            </Link>
          }
        />
        <div className="mt-3">
          {overdueTotal === 0 ? (
            <V4Empty title="Nothing overdue" body="Every assigned task is on time." />
          ) : (
            <ul className="divide-y divide-line/70">
              {people
                .filter((row) => row.overdueTasks > 0)
                .map((row) => (
                  <li key={row.repId} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                    <span className="min-w-0 truncate font-medium text-ink">{row.repName}</span>
                    <Link
                      href={`/team/${row.repId}?tab=work&view=overdue`}
                      className="shrink-0 text-[12px] text-status-danger hover:underline"
                    >
                      {row.overdueTasks} overdue
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </V4Panel>

      <V4Panel>
        <V4PanelHeader eyebrow="Activity" title="Recent activity" hint="Operational events across the team today." />
        <div className="mt-3">
          {timeline === null ? (
            <InlineError>Activity could not be loaded. Refresh to try again.</InlineError>
          ) : (
            <TimelineTable rows={timeline} now={Date.now()} empty="No operational activity today." />
          )}
        </div>
      </V4Panel>
    </div>
  )
}

function todayLabel(row: { completedToday: number; totalTarget?: number }): string {
  return row.totalTarget ? `${row.completedToday} / ${row.totalTarget}` : `${row.completedToday} done`
}

function PeopleRow({
  row,
  availability,
}: {
  row: PeopleRow
  availability: AvailabilityState | null
}) {
  return (
    <tr className="border-b border-line/60 align-top last:border-0">
      <td className="py-2.5 pr-3">
        <Link href={`/team/${row.repId}`} className="text-[13px] font-medium text-ink hover:underline">
          {row.repName}
        </Link>
        <p className="mt-0.5 text-[11px] text-stone">
          {row.roleLabel}
          {availability ? ` · ${availabilityLabel(availability)}` : ''}
        </p>
      </td>
      <td className="py-2.5 pr-3 text-[12px] tabular-nums text-ink">
        {todayLabel(row)}
        {row.totalTarget ? (
          <span className="text-stone"> · {Math.max(0, row.totalTarget - row.completedToday)} left</span>
        ) : null}
      </td>
      <td className="py-2.5 pr-3">
        <Link
          href={`/chats?rep=${row.repId}`}
          className="text-[12px] tabular-nums text-ink hover:underline"
          aria-label={`${row.repliesWaiting} replies waiting for ${row.repName}`}
        >
          {row.repliesWaiting}
        </Link>
      </td>
      <td className="py-2.5 pr-3">
        <Link
          href={`/team/${row.repId}?tab=work&view=overdue`}
          className={`text-[12px] tabular-nums hover:underline ${row.overdueTasks > 0 ? 'text-status-danger' : 'text-stone'}`}
          aria-label={`${row.overdueTasks} overdue tasks for ${row.repName}`}
        >
          {row.overdueTasks}
        </Link>
      </td>
      <td className="py-2.5 pr-3 text-[12px] text-graphite">
        {row.profiles.length > 0 ? row.profiles.join(' · ') : '—'}
      </td>
      <td className="py-2.5 pr-3"><RepStatusBadge status={row.status} /></td>
      <td className="py-2.5 text-right">
        <Link
          href={`/team/${row.repId}`}
          className="inline-flex min-h-11 items-center rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
        >
          Open
        </Link>
      </td>
    </tr>
  )
}

function PeopleCard({
  row,
  availability,
}: {
  row: PeopleRow
  availability: AvailabilityState | null
}) {
  return (
    <div className="rounded-xl bg-bone p-3 ring-1 ring-line/70">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{row.repName}</p>
          <p className="text-[11px] text-stone">
            {row.roleLabel}
            {availability ? ` · ${availabilityLabel(availability)}` : ''}
          </p>
        </div>
        <RepStatusBadge status={row.status} />
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
        <div>
          <dt className="text-stone">Today</dt>
          <dd className="tabular-nums text-ink">{todayLabel(row)}</dd>
        </div>
        <div>
          <dt className="text-stone">Replies</dt>
          <dd className="tabular-nums text-ink">{row.repliesWaiting}</dd>
        </div>
        <div>
          <dt className="text-stone">Overdue</dt>
          <dd className={`tabular-nums ${row.overdueTasks > 0 ? 'text-status-danger' : 'text-ink'}`}>{row.overdueTasks}</dd>
        </div>
      </dl>
      {row.profiles.length > 0 && (
        <p className="mt-2 truncate text-[11px] text-graphite">{row.profiles.join(' · ')}</p>
      )}
      <div className="mt-2.5 flex gap-2">
        <Link
          href={`/team/${row.repId}`}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-graphite hover:text-ink"
        >
          Open
        </Link>
        <Link
          href={`/chats?rep=${row.repId}`}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-graphite hover:text-ink"
        >
          Replies
        </Link>
      </div>
    </div>
  )
}

function WhoWorksWhat({ plan }: { plan: CoveragePlan }) {
  const rows = buildWhoWorksWhat(plan)

  return (
    <V4Panel>
      <V4PanelHeader
        eyebrow="Operating"
        title="Who works what"
        hint="Permanent ownership and active temporary cover, from the canonical coverage plan. Backups never appear here."
      />
      <div className="mt-3">
        {rows.length === 0 ? (
          <V4Empty title="No responsibilities" body="Assign a responsibility to start operating the team." />
        ) : (
          <div className="space-y-4">
            {rows.map((rep) => (
              <div key={rep.repId}>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-stone">{rep.repName}</p>
                <ul className="mt-1.5 space-y-2">
                  {rep.people.map((person) => (
                    <li key={person.profileId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link
                        href={`/team/profiles/${person.profileId}`}
                        className="min-w-0 truncate text-[13px] font-medium text-ink hover:underline"
                      >
                        {person.name}
                      </Link>
                      <span className="flex flex-wrap items-center gap-1">
                        {person.channels.map((channel) => (
                          <span key={channel.channel} className="inline-flex items-center gap-1">
                            <ChannelBadge channel={channel.channel} />
                            <ResponsibilityStatus status={channel.role} />
                            {channel.coveringFor && (
                              <span className="text-[11px] text-stone">covering for {channel.coveringFor}</span>
                            )}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </V4Panel>
  )
}

function CoverageExceptions({ plan }: { plan: CoveragePlan }) {
  const actionRequired = plan.requiresApproval
  const uncovered = plan.profiles.filter(
    (profile) => !actionRequired.some((item) => item.profileId === profile.profileId) && (profile.status === 'UNCOVERED' || !profile.primaryRepId),
  )
  const active = plan.profiles.filter((profile) => profile.activeCoveringRepId)
  const readiness = plan.profiles.filter((profile) => !profile.primaryReady || profile.backups.some((backup) => !backup.ready))
  const expiring = plan.profiles.filter((profile) => profile.coverageExpiring)
  const hasExceptions = actionRequired.length + uncovered.length + active.length + readiness.length + expiring.length > 0

  return (
    <V4Panel>
      <V4PanelHeader
        eyebrow="Coverage"
        title="Coverage exceptions"
        hint="Only profiles that need a decision. Healthy profiles are not listed."
      />
      <div className="mt-3">
        {!hasExceptions ? (
          <V4Empty title="Coverage healthy" body="No action required. Every profile has an available operator." />
        ) : (
          <div className="space-y-4">
            {actionRequired.length > 0 && (
              <ExceptionGroup label="Action required">
                {actionRequired.map((item) => (
                  <ExceptionRow
                    key={`${item.profileId}:${item.kind}`}
                    profileName={item.profileName}
                    body={
                      item.kind === 'RESTORE_PRIMARY'
                        ? `Restore ${item.toRepName} · ${item.reason}`
                        : `Recommended cover: ${item.toRepName} · ${item.reason}`
                    }
                    profileId={item.profileId}
                    actionLabel="Review"
                  />
                ))}
              </ExceptionGroup>
            )}
            {uncovered.length > 0 && (
              <ExceptionGroup label="Uncovered">
                {uncovered.map((profile) => (
                  <ExceptionRow
                    key={profile.profileId}
                    profileName={profile.name}
                    body={profile.primaryRepName ? `Primary ${profile.primaryRepName} is unavailable` : 'No primary operator'}
                    profileId={profile.profileId}
                    actionLabel="Open profile"
                  />
                ))}
              </ExceptionGroup>
            )}
            {active.length > 0 && (
              <ExceptionGroup label="Active temporary cover">
                {active.map((profile) => (
                  <ExceptionRow
                    key={profile.profileId}
                    profileName={profile.name}
                    body={`Primary ${profile.primaryRepName ?? '—'} · temporarily ${profile.activeCoveringRepName ?? '—'}${profile.coverageExpiring ? ' · ends today' : ''}`}
                    profileId={profile.profileId}
                    actionLabel="Open profile"
                  />
                ))}
              </ExceptionGroup>
            )}
            {readiness.length > 0 && (
              <ExceptionGroup label="Access not confirmed">
                {readiness.map((profile) => (
                  <ExceptionRow
                    key={profile.profileId}
                    profileName={profile.name}
                    body={readinessLabel(profile)}
                    profileId={profile.profileId}
                    actionLabel="Open profile"
                  />
                ))}
              </ExceptionGroup>
            )}
            {expiring.length > 0 && (
              <ExceptionGroup label="Cover ends today">
                {expiring.map((profile) => (
                  <ExceptionRow
                    key={profile.profileId}
                    profileName={profile.name}
                    body={`Temporary cover ${profile.activeCoveringRepName ?? '—'} ends today`}
                    profileId={profile.profileId}
                    actionLabel="Open profile"
                  />
                ))}
              </ExceptionGroup>
            )}
          </div>
        )}
      </div>
    </V4Panel>
  )
}

function readinessLabel(profile: CoverageProfileResult): string {
  const parts: string[] = []
  if (!profile.primaryReady) parts.push(`${profile.primaryRepName ?? 'Primary'} has not confirmed access`)
  const notReady = profile.backups.filter((backup) => !backup.ready).length
  if (profile.backups.length > 0) parts.push(`${profile.backups.length - notReady} of ${profile.backups.length} backups can operate this profile`)
  return parts.join(' · ')
}

function ExceptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-stone">{label}</p>
      <ul className="divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line/70">
        {children}
      </ul>
    </div>
  )
}

function ExceptionRow({
  profileName,
  body,
  profileId,
  actionLabel,
}: {
  profileName: string
  body: string
  profileId: string
  actionLabel: string
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 bg-bone px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ink">{profileName}</p>
        <p className="truncate text-[12px] text-graphite">{body}</p>
      </div>
      <Link
        href={`/team/profiles/${profileId}`}
        className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
      >
        {actionLabel}
      </Link>
    </li>
  )
}
