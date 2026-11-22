import { getPeopleDirectory, type OpsPageContext } from '@/lib/operations/page-context'
import { loadTeamDay } from '@/lib/rep-day/team'
import { loadCoverageFacts, loadCoveragePlan } from '@/lib/coverage/load'
import { loadDailyPlanProgress } from '@/lib/targets/load-plan-progress'
import { getOrganizationDailySummary } from '@/lib/execution/accountability'
import { loadCanonicalProfileAssignments } from '@/lib/profiles/canonical'
import { loadTimeline } from '@/lib/operations/activity'
import { effectiveRepIds } from '@/lib/operations/scope'
import { rangeWindow } from '@/lib/operations/filters'
import { deriveCommandCenter, type CommandCenterData, type CommandProfileFact } from './command-center'

/**
 * Load the Team Command Center in bounded, batched reads.
 *
 * Every source is a canonical contract already used by another surface, so the
 * command center cannot invent a number the rest of the product disagrees with.
 * Unassigned profiles and pending acknowledgements are read directly instead of
 * re-running the whole profile directory (which would repeat `loadTeamLive`).
 */
export async function loadTeamCommandCenter(ctx: OpsPageContext): Promise<CommandCenterData> {
  const [directory, team, facts, canonical, acknowledgementRows] = await Promise.all([
    getPeopleDirectory(),
    loadTeamDay(),
    loadCoverageFacts(ctx.auth.orgId, { client: ctx.client }),
    loadCanonicalProfileAssignments(ctx.auth.orgId, { client: ctx.client }),
    ctx.client
      .from('responsibility_acknowledgements')
      .select('profile_id, rep_id')
      .eq('organization_id', ctx.auth.orgId)
      .is('acknowledged_at', null)
      .in('subject', ['PRIMARY', 'OPERATOR'])
      .limit(2000),
  ])
  if (acknowledgementRows.error) throw acknowledgementRows.error

  const pendingByProfile = new Map<string, string[]>()
  for (const row of (acknowledgementRows.data ?? []) as Array<{ profile_id: string; rep_id: string }>) {
    const list = pendingByProfile.get(row.profile_id) ?? []
    if (!list.includes(row.rep_id)) list.push(row.rep_id)
    pendingByProfile.set(row.profile_id, list)
  }
  const nameByProfileId = new Map(canonical.profiles.map((profile) => [profile.profileId, profile.profileName]))
  const channelsByProfileId = new Map(canonical.profiles.map((profile) => [profile.profileId, profile.channels]))
  const profiles: CommandProfileFact[] = [...pendingByProfile.entries()].map(([profileId, repIds]) => ({
    profileId,
    profileName: nameByProfileId.get(profileId) ?? 'Profile',
    channels: channelsByProfileId.get(profileId) ?? [],
    pendingAcknowledgementRepIds: repIds,
  }))

  const [plan, progress, timeline, accountability] = await Promise.all([
    loadCoveragePlan(ctx.auth.orgId, { client: ctx.client }, facts),
    loadDailyPlanProgress(ctx.client, {
      orgId: ctx.auth.orgId,
      businessDate: team.businessDate,
    }),
    loadTimeline(ctx.client, {
      orgId: ctx.auth.orgId,
      repIds: effectiveRepIds(ctx.scope, {}),
      start: rangeWindow('today').start,
      end: rangeWindow('today').end,
      limit: 20,
    }).catch(() => null),
    getOrganizationDailySummary(ctx.client, {
      orgId: ctx.auth.orgId,
      businessDate: team.businessDate,
    }).catch(() => null),
  ])

  return deriveCommandCenter({
    businessDate: team.businessDate,
    timezone: team.timezone,
    isWorkingDay: team.isWorkingDay,
    team,
    directory,
    plan,
    progress,
    canonical,
    profiles,
    timeline,
    repNameById: new Map(directory.rows.map((row) => [row.repId, row.repName])),
    accountability: accountability ?? undefined,
  })
}
