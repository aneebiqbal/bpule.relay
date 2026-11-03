import { PageHeader } from '@/components/ui/page-header'
import { InlineError } from '@/components/operations/ops-primitives'
import { OpsFilters } from '@/components/operations/ops-filters'
import { SavedViewsMenu } from '@/components/operations/saved-views-menu'
import { TaskBoard } from '@/components/operations/task-board'
import { AssignTaskButton } from '@/components/operations/assign-task-button'
import { assignableReps, getPeopleDirectory, requireTeamContext } from '@/lib/operations/page-context'
import { parseOpsFilters } from '@/lib/operations/filters'
import { loadUnifiedTasks } from '@/lib/tasks/load-unified-tasks'
import type { UnifiedTask } from '@/lib/tasks/types'

export const dynamic = 'force-dynamic'

/**
 * Team → Tasks. "Who has what work?" — every assigned task in the manager's
 * scope, grouped by rep, priority or due date. Same engine as /tasks.
 */
export default async function TeamTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireTeamContext()
  const sp = await searchParams
  const filters = parseOpsFilters(sp)

  let tasks: UnifiedTask[] | null = null
  const [reps, directory] = await Promise.all([assignableReps(ctx), getPeopleDirectory().catch(() => null)])
  try {
    tasks = await loadUnifiedTasks({ auth: ctx.auth, derivedActions: [], includeCompleted: true })
  } catch (err) {
    console.error('team tasks failed:', err)
  }

  const teamMembers = filters.team ? new Set(directory?.teams.find((t) => t.id === filters.team)?.memberIds ?? []) : null
  const visible = (tasks ?? []).filter((t) => {
    if (filters.rep && t.assigneeRepId !== filters.rep) return false
    if (teamMembers && !teamMembers.has(t.assigneeRepId)) return false
    return true
  })

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Team"
        title="Tasks"
        description="Assigned work across your team. Derived sales work lives on each rep's Home and Conversations."
        action={<AssignTaskButton reps={reps} />}
      />
      <OpsFilters
        basePath="/team/tasks"
        current={{ team: filters.team, rep: filters.rep, view: filters.view, group: filters.group }}
        filters={[
          ...(directory && directory.teams.length > 0
            ? [{ key: 'team', label: 'Team', allLabel: 'All teams', options: directory.teams.map((t) => ({ value: t.id, label: t.name })) }]
            : []),
          { key: 'rep', label: 'Rep', allLabel: 'All reps', options: reps.map((r) => ({ value: r.id, label: r.name })) },
        ]}
        trailing={<SavedViewsMenu surface="team.tasks" />}
      />
      {tasks === null ? (
        <InlineError>Tasks could not be loaded. Refresh to try again.</InlineError>
      ) : (
        <TaskBoard tasks={visible} reps={reps} canManage currentRepId={ctx.auth.repId} now={Date.now()} />
      )}
    </div>
  )
}
