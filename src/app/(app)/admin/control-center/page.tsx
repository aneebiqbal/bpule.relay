import { redirect } from 'next/navigation'
import { requireAdminOpsContext } from '@/lib/operations/page-context'
import { loadTeamProfileDirectory } from '@/lib/team/profiles'
import { loadPeopleDirectory } from '@/lib/operations/people'
import { scanAssignmentDrift } from '@/lib/profiles/reconcile'
import { ControlCenter } from '@/components/admin/control-center'

export const dynamic = 'force-dynamic'

/**
 * Admin → Control Center: profiles, team and data issues in one workspace.
 *
 * Every management action here funnels through the canonical services
 * (responsibility chain, execution scope, targets, reconciliation). The page
 * only composes existing workspaces and loads their canonical data.
 */
export default async function AdminControlCenterPage() {
  const ctx = await requireAdminOpsContext()

  const [profiles, people, reconciliation, repRows] = await Promise.all([
    loadTeamProfileDirectory(ctx.auth.orgId),
    loadPeopleDirectory(ctx.client, ctx.auth, ctx.scope),
    scanAssignmentDrift(ctx.client, ctx.auth.orgId),
    ctx.client.from('reps').select('id, name').eq('organization_id', ctx.auth.orgId).order('name').limit(2000),
  ])

  const reps = (repRows.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    profiles: profiles.rows
      .filter((profile) => profile.assignedRepIds.includes(row.id as string))
      .map((profile) => (profile.channels.length > 0 ? `${profile.profileName} · ${profile.channels.join(' · ')}` : profile.profileName)),
  }))

  return (
    <ControlCenter
      profiles={profiles.rows}
      businessDate={profiles.businessDate}
      reps={reps}
      people={people}
      report={reconciliation}
      isAdmin={ctx.auth.isAdmin || ctx.auth.isOwner}
    />
  )
}
