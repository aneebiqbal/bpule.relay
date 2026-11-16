import { PageHeader } from '@/components/ui/page-header'
import { InlineError } from '@/components/operations/ops-primitives'
import { PeopleWorkspace } from '@/components/team/people-workspace'
import { requireTeamContext, assignableReps } from '@/lib/operations/page-context'
import { loadPeopleDirectory } from '@/lib/operations/people'

export const dynamic = 'force-dynamic'

/**
 * Team → People: actionable member cards.
 *
 * The directory contract is the same one Manager Home and the command center
 * use, so assignments, targets and workload never disagree between surfaces.
 */
export default async function TeamPeoplePage() {
  const ctx = await requireTeamContext()

  let directory = null
  let failed = false
  try {
    directory = await loadPeopleDirectory(ctx.client, ctx.auth, ctx.scope)
  } catch (err) {
    console.error('team directory failed:', err)
    failed = true
  }

  const reps = await assignableReps(ctx)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Team"
        title="People"
        description={
          ctx.scope.mode === 'org'
            ? 'Everyone in the organization, their accounts, targets and workload.'
            : 'The people you manage, their accounts, targets and workload.'
        }
      />
      {failed || !directory ? (
        <InlineError>The team directory could not be loaded. Refresh to try again.</InlineError>
      ) : (
        <PeopleWorkspace
          directory={directory}
          businessDate={directory.businessDate}
          canAssign={ctx.scope.mode !== 'own'}
          reps={reps}
        />
      )}
    </div>
  )
}
