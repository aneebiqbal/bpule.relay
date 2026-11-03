import Link from 'next/link'
import { UsersRound } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineError } from '@/components/operations/ops-primitives'
import { getPeopleDirectory, requireTeamContext } from '@/lib/operations/page-context'

export const dynamic = 'force-dynamic'

/** Team → Teams. One row per team with the numbers that need a manager. */
export default async function TeamsPage() {
  const ctx = await requireTeamContext()
  const directory = await getPeopleDirectory().catch((err) => {
    console.error('teams page failed:', err)
    return null
  })

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Team"
        title="Teams"
        description={ctx.scope.mode === 'org' ? 'Every team in the organization.' : 'The teams you manage.'}
        action={
          ctx.scope.mode === 'org' ? (
            <Link href="/admin/people" className="relay-cta text-[12px]">
              Manage teams
            </Link>
          ) : undefined
        }
      />

      {!directory ? (
        <InlineError>Teams could not be loaded. Refresh to try again.</InlineError>
      ) : directory.teams.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No teams yet"
          description={
            ctx.scope.mode === 'org'
              ? 'Create a team and add members in Access & roles.'
              : 'You do not manage a team yet.'
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {directory.teams.map((team) => (
            <li key={team.id}>
              <Link
                href={`/team/groups/${team.id}`}
                className="block rounded-lg border border-line bg-bone-raised px-4 py-3 transition-colors hover:border-orange/30"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="truncate text-[15px] font-medium text-ink">{team.name}</h2>
                  {team.needsAttention > 0 && (
                    <span className="shrink-0 text-[12px] text-orange">{team.needsAttention} need attention</span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[12px] text-graphite">
                  Manager: {team.managers.length ? team.managers.map((m) => m.name).join(', ') : 'Not set'}
                </p>
                <dl className="mt-3 grid grid-cols-5 gap-2 text-[12px]">
                  {[
                    ['Members', team.memberCount],
                    ['Active leads', team.activeLeads],
                    ['Replies waiting', team.repliesWaiting],
                    ['Overdue tasks', team.overdueTasks],
                    ['Meetings', team.meetings],
                  ].map(([label, value]) => (
                    <div key={label as string} className="min-w-0">
                      <dt className="truncate text-stone">{label}</dt>
                      <dd className="tabular-nums text-[15px] text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
