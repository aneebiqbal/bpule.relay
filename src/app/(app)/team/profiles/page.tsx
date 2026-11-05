import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth/organization'
import { loadTeamLive } from '@/lib/admin/load-team-live'
import { loadTeamDay } from '@/lib/rep-day/team'
import { filterTeamLiveToRepIds } from '@/lib/team/manager-home-summary'
import { buildTeamProfiles, type TeamProfileRow } from '@/lib/team/profiles'
import { TeamProfilesTable } from '@/components/team/team-profiles-table'

export const dynamic = 'force-dynamic'

/**
 * Team → Profiles: the profile-first execution view.
 *
 * `loadTeamDay` scopes the caller (admin → org, manager → managed team);
 * `loadTeamLive` supplies the canonical targets and channel identities.
 */
export default async function TeamProfilesPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')
  if (!ctx.isAdmin && !ctx.isManager) redirect('/dashboard')

  let profiles: TeamProfileRow[] = []
  let businessDate = ''
  let loadError = false
  try {
    const [team, live] = await Promise.all([loadTeamDay(), loadTeamLive(ctx.orgId)])
    businessDate = team.businessDate
    const scoped = filterTeamLiveToRepIds(
      live,
      new Set(team.reps.map((rep) => rep.repId)),
    )
    profiles = buildTeamProfiles(scoped)
  } catch {
    // A profile-load failure must not take the page down.
    loadError = true
  }

  return (
    <TeamProfilesTable
      profiles={profiles}
      businessDate={businessDate}
      error={loadError}
    />
  )
}
