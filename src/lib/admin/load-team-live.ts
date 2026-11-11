import { createServerSupabase } from '@/lib/supabase/server'
import { assembleTeamLive, type TeamLivePayload } from '@/lib/admin/team-live'
import { businessDateRange, currentInstant, orgDate } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'

const OPEN_STATUSES = ['new', 'contacted', 'followed_up', 'replied']

export async function loadTeamLive(orgId: string, now = currentInstant()): Promise<TeamLivePayload> {
  const supabase = await createServerSupabase()
  const policy = await loadOperatingPolicy(orgId, supabase)
  const businessDate = orgDate(now, policy.timezone)
  const { start: startOfDay, end: endOfDay } = businessDateRange(businessDate, policy.timezone)

  const [
    reps,
    identities,
    assignments,
    plans,
    accountability,
    messages,
    leadsToday,
    extractions,
    openLeads,
    profiles,
  ] = await Promise.all([
    supabase.from('reps').select('id, name, role').eq('organization_id', orgId),
    supabase.from('revenue_identities').select('id, identity_name, channel, title, profile_id').eq('organization_id', orgId).eq('status', 'active'),
    supabase.from('identity_assignments').select('revenue_identity_id, rep_id').eq('organization_id', orgId),
    supabase.from('daily_target_plans').select('revenue_identity_id, activity_type, target_count').eq('organization_id', orgId).eq('active', true),
    supabase.from('daily_accountability').select('rep_id, revenue_identity_id, activity_type, completed_count, status').eq('organization_id', orgId).eq('target_date', businessDate),
    supabase.from('messages').select('rep_id, type, sent_at').eq('organization_id', orgId).not('sent_at', 'is', null).gte('sent_at', startOfDay).lt('sent_at', endOfDay),
    supabase.from('leads').select('owner_rep_id, created_at').eq('organization_id', orgId).gte('created_at', startOfDay).lt('created_at', endOfDay),
    supabase.from('extraction_runs').select('rep_id, success, created_at').eq('organization_id', orgId).gte('created_at', startOfDay).lt('created_at', endOfDay),
    supabase.from('leads').select('id, owner_rep_id, company, contact_name, status, canonical_score, score').eq('organization_id', orgId).in('status', OPEN_STATUSES).order('created_at', { ascending: false }).limit(800),
    supabase.from('profiles').select('id, display_name, full_name, label, person_id').eq('organization_id', orgId),
  ])

  // The plan is channel-owned; the current operator is the profile's PRIMARY.
  const profileBydentity = new Map(
    (identities.data ?? []).map((row) => [row.id as string, (row as { profile_id: string | null }).profile_id]),
  )
  const profileIds = [...new Set([...profileBydentity.values()].filter((id): id is string => Boolean(id)))]
  const { data: coverageRows } = profileIds.length > 0
    ? await supabase
        .from('profile_coverage').select('profile_id, rep_id')
        .eq('organization_id', orgId).eq('active', true).eq('role', 'PRIMARY')
        .in('profile_id', profileIds)
    : { data: [] as Array<Record<string, unknown>> }
  const primaryByProfile = new Map((coverageRows ?? []).map((row) => [row.profile_id as string, row.rep_id as string]))
  const targets = (plans.data ?? []).map((row) => ({
    rep_id: primaryByProfile.get(profileBydentity.get(row.revenue_identity_id as string) ?? '') ?? 'unassigned',
    revenue_identity_id: row.revenue_identity_id,
    activity_type: row.activity_type,
    target_count: row.target_count,
  }))

  return assembleTeamLive({
    now,
    businessDate,
    timezone: policy.timezone,
    reps: reps.data ?? [],
    identities: identities.data ?? [],
    assignments: assignments.data ?? [],
    targets,
    accountability: accountability.data ?? [],
    messages: messages.data ?? [],
    leadsToday: leadsToday.data ?? [],
    extractions: extractions.data ?? [],
    openLeads: openLeads.data ?? [],
    profiles: profiles.data ?? [],
  })
}
