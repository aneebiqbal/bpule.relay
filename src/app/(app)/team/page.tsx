import { createServerSupabase } from '@/lib/supabase/server'
import { requireTeamContext, assignableReps } from '@/lib/operations/page-context'
import { loadTeamCommandCenter } from '@/lib/team/load-command-center'
import { TeamCommandCenter } from '@/components/team/team-command-center'

export const dynamic = 'force-dynamic'

/**
 * Team → Command Center: the default operating surface for managers and admins.
 *
 * It answers who is working, who owns which profile/channel, which targets are
 * behind, where coverage is missing, and what to do next — without sending the
 * admin through People, Profiles, Today and Performance. Those pages remain as
 * drilldowns for detailed analysis.
 */
export default async function TeamPage() {
  const ctx = await requireTeamContext()
  const [data, reps, profileRows, identityRows] = await Promise.all([
    loadTeamCommandCenter(ctx),
    assignableReps(ctx),
    createServerSupabase().then((client) =>
      client
        .from('profiles')
        .select('id, display_name, full_name, label')
        .eq('organization_id', ctx.auth.orgId)
        .limit(500),
    ),
    createServerSupabase().then((client) =>
      client
        .from('revenue_identities')
        .select('id, identity_name, channel, profile_id')
        .eq('organization_id', ctx.auth.orgId)
        .eq('status', 'active')
        .limit(500),
    ),
  ])

  const profiles = (profileRows.data ?? [])
    .map((row) => ({
      id: row.id as string,
      name: (row.display_name ?? row.full_name ?? row.label ?? 'Unnamed profile') as string,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const identities = (identityRows.data ?? []).map((row) => ({
    id: row.id as string,
    profileId: (row.profile_id as string | null) ?? '',
    channel: row.channel as string,
    name: row.identity_name as string,
  }))

  return (
    <TeamCommandCenter
      data={data}
      reps={reps}
      profiles={profiles}
      identities={identities}
      canManage={ctx.auth.isAdmin || ctx.auth.isOwner || ctx.auth.capabilities.has('MANAGE_REVENUE_IDENTITIES')}
      canManageTargets={ctx.auth.capabilities.has('MANAGE_TEAM_TARGETS')}
    />
  )
}
