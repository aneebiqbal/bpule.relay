import Link from 'next/link'
import { Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { MetricStrip, InlineError, Section } from '@/components/operations/ops-primitives'
import { OpsFilters } from '@/components/operations/ops-filters'
import { SavedViewsMenu } from '@/components/operations/saved-views-menu'
import { PeopleTable } from '@/components/operations/people-table'
import { requireTeamContext } from '@/lib/operations/page-context'
import { loadPeopleDirectory, type PeopleDirectory } from '@/lib/operations/people'
import { parseOpsFilters } from '@/lib/operations/filters'

export const dynamic = 'force-dynamic'

const STATUS_VIEWS = [
  { value: 'attention', label: 'Needs attention' },
  { value: 'critical', label: 'Critical' },
  { value: 'on_track', label: 'On track' },
]

/**
 * Team → People. The dense directory: who is on the team and what each person
 * has on their plate. Rows come from the same contract as Manager Home and the
 * Team overview, so the numbers never disagree between surfaces.
 */
export default async function TeamPeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireTeamContext()
  const filters = parseOpsFilters(await searchParams)

  let directory: PeopleDirectory | null = null
  let failed = false
  try {
    directory = await loadPeopleDirectory(ctx.client, ctx.auth, ctx.scope)
  } catch (err) {
    console.error('team directory failed:', err)
    failed = true
  }

  const current = { team: filters.team, view: filters.view, q: filters.q }
  const header = (
    <PageHeader
      eyebrow="Team"
      title="People"
      description={
        ctx.scope.mode === 'org'
          ? 'Everyone in the organization and the work in front of them right now.'
          : 'The people you manage and the work in front of them right now.'
      }
    />
  )

  if (failed || !directory) {
    return (
      <div className="space-y-4">
        {header}
        <InlineError>The team directory could not be loaded. Refresh to try again.</InlineError>
      </div>
    )
  }

  const teamMembers = filters.team ? new Set(directory.teams.find((t) => t.id === filters.team)?.memberIds ?? []) : null
  const q = filters.q?.toLowerCase() ?? null
  const rows = directory.rows.filter((r) => {
    if (teamMembers && !teamMembers.has(r.repId)) return false
    if (filters.view === 'attention' && r.status === 'On track') return false
    if (filters.view === 'critical' && r.status !== 'Critical') return false
    if (filters.view === 'on_track' && r.status !== 'On track') return false
    if (q && !`${r.repName} ${r.activeProfile ?? ''} ${r.teams.map((t) => t.name).join(' ')}`.toLowerCase().includes(q)) return false
    return true
  })

  const sum = (key: 'repliesWaiting' | 'followUpsOverdue' | 'overdueTasks' | 'openLeads' | 'meetings' | 'wins') =>
    rows.reduce((s, r) => s + r[key], 0)
  const attentionCount = rows.filter((r) => r.status !== 'On track').length
  const leadScope = ctx.leadScope

  return (
    <div className="space-y-5">
      {header}

      {directory.rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No team members yet"
          description={
            ctx.scope.mode === 'org'
              ? 'Invite people and assign sending profiles to start tracking team work.'
              : 'No one is on a team you manage yet. An admin can add members in Access & roles.'
          }
          action={
            ctx.scope.mode === 'org' ? (
              <Link href="/admin/people" className="relay-cta text-[12px]">
                Invite people
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <MetricStrip
            metrics={[
              { label: 'People', value: rows.length, href: null },
              { label: 'Need attention', value: attentionCount, href: '/team/people?view=attention', tone: attentionCount ? 'attention' : 'default' },
              { label: 'Replies waiting', value: sum('repliesWaiting'), href: `/chats?view=waiting_me&scope=${leadScope}`, tone: sum('repliesWaiting') ? 'attention' : 'default' },
              { label: 'Follow-ups due', value: sum('followUpsOverdue'), href: `/chats?view=followups&scope=${leadScope}` },
              { label: 'Overdue tasks', value: sum('overdueTasks'), href: '/tasks?view=overdue', tone: sum('overdueTasks') ? 'critical' : 'default' },
              { label: 'Open leads', value: sum('openLeads'), href: `/leads?scope=${leadScope}` },
            ]}
          />

          <OpsFilters
            basePath="/team/people"
            current={current}
            search={{ placeholder: 'Search people, profiles or teams…' }}
            filters={[
              ...(directory.teams.length > 0
                ? [{ key: 'team', label: 'Team', allLabel: 'All teams', options: directory.teams.map((t) => ({ value: t.id, label: t.name })) }]
                : []),
              { key: 'view', label: 'Status', allLabel: 'Any status', options: STATUS_VIEWS },
            ]}
            trailing={<SavedViewsMenu surface="team.people" />}
          />

          <PeopleTable rows={rows} />

          {directory.attention.length > 0 && (
            <Section title="Attention" description="The oldest and largest gaps across the team, most urgent first.">
              <ul className="divide-y divide-line/70 rounded-lg border border-line">
                {directory.attention
                  .filter((a) => !teamMembers || teamMembers.has(a.repId))
                  .slice(0, 6)
                  .map((a) => (
                    <li key={`${a.repId}-${a.category}`}>
                      <Link href={a.href} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] hover:bg-bone-raised">
                        <span className="min-w-0 truncate">
                          <span className="font-medium text-ink">{a.repName}</span>
                          <span className="text-graphite"> · {a.reason}</span>
                        </span>
                        <span className="shrink-0 text-[12px] capitalize text-stone">{a.severity}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </Section>
          )}
        </>
      )}

      {ctx.scope.mode === 'org' && (
        <Link href="/team/eval" className="inline-flex text-[13px] font-medium text-ink">
          Reply quality and system health
        </Link>
      )}
    </div>
  )
}
