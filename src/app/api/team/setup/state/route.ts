import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { loadCanonicalProfileAssignments } from '@/lib/profiles/canonical'
import { loadDailyPlanProgress } from '@/lib/targets/load-plan-progress'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { currentInstant, orgDate } from '@/lib/org-clock'
import { activityLabel } from '@/lib/responsibility/activity-registry'

export const dynamic = 'force-dynamic'

/**
 * The current team configuration, read through canonical services.
 *
 * One account per row: distinct channel identity, its chain (primary /
 * operators / backups) and its channel plan with per-operator allocations.
 * The Setup Assistant shows this before proposing anything, so the admin
 * always edits real state rather than a guess.
 */
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!ctx.isAdmin && !can(ctx, 'MANAGE_REVENUE_IDENTITIES') && !can(ctx, 'MANAGE_TEAM_TARGETS')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const client = await createServerSupabase()
  const policy = await loadOperatingPolicy(ctx.orgId, client)
  const businessDate = orgDate(currentInstant(), policy.timezone)

  const [canonical, progress, repRows] = await Promise.all([
    loadCanonicalProfileAssignments(ctx.orgId, { client }),
    loadDailyPlanProgress(client, { orgId: ctx.orgId, businessDate }),
    client.from('reps').select('id, name').eq('organization_id', ctx.orgId).order('name').limit(500),
  ])

  const { data: identityRows, error: identityError } = await client
    .from('revenue_identities')
    .select('id, profile_id, identity_name, channel, status')
    .eq('organization_id', ctx.orgId)
    .eq('status', 'active')
    .limit(1000)
  if (identityError) return NextResponse.json({ error: identityError.message }, { status: 500 })

  const profileById = new Map(canonical.profiles.map((profile) => [profile.profileId, profile]))
  const progressByIdentity = new Map(progress.map((row) => [row.identityId, row]))
  const repNameById = new Map((repRows.data ?? []).map((row) => [row.id as string, row.name as string]))

  const identities = (identityRows ?? []) as Array<{
    id: string
    profile_id: string | null
    identity_name: string
    channel: string
  }>

  const accounts = identities
    .flatMap((identity) => {
      const profileId = (identity.profile_id as string | null) ?? null
      if (!profileId) return []
      const profile = profileById.get(profileId)
      if (!profile) return []
      const plan = progressByIdentity.get(identity.id as string)
      return [{
        identityId: identity.id as string,
        profileId,
        profileName: profile.profileName,
        channel: identity.channel as string,
        identityName: identity.identity_name as string,
        primary: profile.primaryRepId
          ? { repId: profile.primaryRepId, repName: repNameById.get(profile.primaryRepId) ?? 'Unknown' }
          : null,
        operators: profile.operators.map((seat) => ({
          repId: seat.repId,
          repName: repNameById.get(seat.repId) ?? seat.repName,
        })),
        backups: profile.backups.map((seat) => ({
          repId: seat.repId,
          repName: repNameById.get(seat.repId) ?? seat.repName,
        })),
        targets: (plan?.lanes ?? [])
          .filter((lane) => lane.targetable)
          .map((lane) => ({
            activityType: lane.activityType,
            label: activityLabel(lane.activityType),
            targetCount: lane.targetCount,
            allocations: lane.allocations.map((allocation) => ({
              repId: allocation.repId,
              repName: repNameById.get(allocation.repId) ?? 'Unknown',
              targetCount: allocation.targetCount,
            })),
          })),
        shared: plan ? !plan.allocated : true,
      }]
    })
    .sort((a, b) => a.profileName.localeCompare(b.profileName) || a.channel.localeCompare(b.channel))

  return NextResponse.json({
    accounts,
    reps: (repRows.data ?? []).map((row) => ({ id: row.id as string, name: row.name as string })),
  })
}
