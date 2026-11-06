import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth/organization'
import { loadTeamDay } from '@/lib/rep-day/team'
import { loadTeamProfileDirectory, type TeamProfileDirectoryRow } from '@/lib/team/profiles'
import { TeamProfilesTable } from '@/components/team/team-profiles-table'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Team → Profiles: the admin profile control surface and onboarding entry point.
 *
 * `loadTeamDay` scopes the caller (admin → org, manager → managed team);
 * `loadTeamProfileDirectory` supplies every profile, assigned or not.
 */
export default async function TeamProfilesPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')
  if (!ctx.isAdmin && !ctx.isManager) redirect('/dashboard')

  let profiles: TeamProfileDirectoryRow[] = []
  let businessDate = ''
  let reps: Array<{ id: string; name: string; profiles: string[] }> = []
  let loadError = false
  try {
    const supabase = await createServerSupabase()
    const [directory, team, repRows] = await Promise.all([
      loadTeamProfileDirectory(ctx.orgId),
      loadTeamDay(),
      supabase.from('reps').select('id, name').eq('organization_id', ctx.orgId).limit(2000),
    ])
    businessDate = directory.businessDate
    const allowed = new Set(team.reps.map((rep) => rep.repId))
    profiles = ctx.isAdmin || ctx.isOwner
      ? directory.rows
      : directory.rows.filter(
          (row) => row.assignmentCount === 0 || row.assignedRepIds.some((id) => allowed.has(id)),
        )
    reps = (repRows.data ?? []).map((rep) => ({
      id: rep.id,
      name: rep.name,
      profiles: profiles
        .filter((row) => row.assignedRepIds.includes(rep.id))
        .map((row) =>
          row.channels.length > 0 ? `${row.profileName} · ${row.channels.join(' · ')}` : row.profileName,
        ),
    }))
  } catch {
    // A profile-load failure must not take the page down.
    loadError = true
  }

  return (
    <TeamProfilesTable
      profiles={profiles}
      businessDate={businessDate}
      error={loadError}
      reps={reps}
    />
  )
}
