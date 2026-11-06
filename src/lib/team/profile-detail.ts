import { createServerSupabase } from '@/lib/supabase/server'
import { currentInstant, orgDate } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'

export interface TeamProfileDetail {
  profileId: string
  profileName: string
  channels: string[]
  identityIds: string[]
  assignedReps: string[]
  targetCount: number
  completedCount: number
  remaining: number
  status: string | null
  targets: Array<{ activityType: string; targetCount: number; completedCount: number; status: string | null }>
  businessDate: string
}

/** One operational detail surface for a sending profile. */
export async function loadTeamProfileDetail(
  orgId: string,
  profileId: string,
): Promise<TeamProfileDetail | null> {
  const supabase = await createServerSupabase()
  const policy = await loadOperatingPolicy(orgId)
  const businessDate = orgDate(currentInstant(), policy.timezone)

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, full_name, label')
    .eq('id', profileId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!profile) return null

  const { data: identities } = await supabase
    .from('revenue_identities')
    .select('id, channel')
    .eq('organization_id', orgId)
    .eq('profile_id', profileId)
    .limit(50)
  const identityIds = (identities ?? []).map((identity) => identity.id)

  const [assignmentRes, targetRes, accountabilityRes] = await Promise.all([
    identityIds.length > 0
      ? supabase.from('identity_assignments').select('rep_id').eq('organization_id', orgId).in('revenue_identity_id', identityIds).limit(200)
      : Promise.resolve({ data: [] as Array<{ rep_id: string }> }),
    identityIds.length > 0
      ? supabase.from('daily_targets').select('revenue_identity_id, activity_type, target_count').eq('organization_id', orgId).in('revenue_identity_id', identityIds).eq('active', true).limit(200)
      : Promise.resolve({ data: [] as Array<{ revenue_identity_id: string; activity_type: string; target_count: number }> }),
    identityIds.length > 0
      ? supabase.from('daily_accountability').select('revenue_identity_id, activity_type, completed_count, status').eq('organization_id', orgId).in('revenue_identity_id', identityIds).eq('target_date', businessDate).limit(200)
      : Promise.resolve({ data: [] as Array<{ revenue_identity_id: string; activity_type: string; completed_count: number; status: string | null }> }),
  ])

  const repIds = [...new Set((assignmentRes.data ?? []).map((assignment) => assignment.rep_id))]
  const { data: repRows } = repIds.length > 0
    ? await supabase.from('reps').select('id, name').eq('organization_id', orgId).in('id', repIds).limit(200)
    : { data: [] as Array<{ id: string; name: string }> }
  const repNameById = new Map((repRows ?? []).map((rep) => [rep.id, rep.name]))

  const targets = (targetRes.data ?? []).map((target) => {
    const accountability = (accountabilityRes.data ?? []).find(
      (row) => row.revenue_identity_id === target.revenue_identity_id && row.activity_type === target.activity_type,
    )
    return {
      activityType: target.activity_type,
      targetCount: target.target_count,
      completedCount: accountability?.completed_count ?? 0,
      status: accountability?.status ?? null,
    }
  })

  const statusRank: Record<string, number> = { missed: 3, at_risk: 2, completed: 1, on_track: 0 }
  let status: string | null = null
  let rank = -1
  for (const target of targets) {
    const targetRank = statusRank[target.status ?? ''] ?? -1
    if (targetRank > rank) {
      rank = targetRank
      status = target.status
    }
  }

  const targetCount = targets.reduce((sum, target) => sum + target.targetCount, 0)
  const completedCount = targets.reduce((sum, target) => sum + target.completedCount, 0)

  return {
    profileId,
    profileName: profile.display_name ?? profile.full_name ?? profile.label ?? 'Unnamed',
    channels: [...new Set((identities ?? []).map((identity) => identity.channel))].sort(),
    identityIds,
    assignedReps: repIds.map((id) => repNameById.get(id) ?? 'Unknown'),
    targetCount,
    completedCount,
    remaining: Math.max(0, targetCount - completedCount),
    status,
    targets,
    businessDate,
  }
}
